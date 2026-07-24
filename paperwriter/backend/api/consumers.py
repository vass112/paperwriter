import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth.models import User
from django.utils import timezone
from datetime import timedelta


class DocumentConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.document_id = self.scope['url_route']['kwargs']['document_id']
        self.document_group_name = f'document_{self.document_id}'
        self.user = self.scope['user']

        # If not authenticated via session cookie, try token auth (cross-domain)
        if self.user.is_anonymous:
            await self._try_token_auth()

        if self.user.is_anonymous:
            await self.close()
            return

        has_access = await database_sync_to_async(self._check_access)()
        if not has_access:
            await self.close()
            return

        await self.channel_layer.group_add(
            self.document_group_name,
            self.channel_name
        )

        await database_sync_to_async(self._add_presence)()
        await self.accept()

        await self.send(text_data=json.dumps({
            'type': 'connected',
            'message': 'Connected to document',
        }))

        await self._broadcast_presence()

    async def disconnect(self, close_code):
        if hasattr(self, 'user') and self.user and not self.user.is_anonymous:
            await database_sync_to_async(self._remove_presence)()
            await database_sync_to_async(self._release_all_locks)()
            await self._broadcast_presence()
            await self._broadcast_locks()

        await self.channel_layer.group_discard(
            self.document_group_name,
            self.channel_name
        )

    async def _try_token_auth(self):
        """Validate a short-lived token from query string for cross-domain WS auth."""
        from django.core.signing import TimestampSigner, BadSignature, SignatureExpired
        from channels.db import database_sync_to_async

        query_string = self.scope.get('query_string', b'').decode()
        params = dict(q.split('=') for q in query_string.split('&') if '=' in q)
        token = params.get('token', '')
        if not token:
            return

        signer = TimestampSigner()
        try:
            user_id = signer.unsign(token, max_age=300)  # 5 minute expiry
            user = await database_sync_to_async(
                lambda: __import__('django.contrib.auth.models', fromlist=['User']).User.objects.get(id=int(user_id))
            )()
            if user.is_active:
                self.user = user
        except (BadSignature, SignatureExpired):
            pass
        except Exception:
            pass

    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
        except json.JSONDecodeError:
            return
        msg_type = data.get('type', '')

        if msg_type == 'section_focus':
            await self._handle_section_focus(data)
        elif msg_type == 'section_blur':
            await self._handle_section_blur(data)
        elif msg_type == 'content_update':
            await self._handle_content_update(data)
        elif msg_type == 'heartbeat':
            await self._handle_heartbeat(data)

    async def _handle_section_focus(self, data):
        section_id = data.get('section_id')
        if not section_id:
            return

        lock_result = await database_sync_to_async(self._acquire_lock)(section_id)

        await self.send(text_data=json.dumps({
            'type': 'lock_result',
            'section_id': section_id,
            'acquired': lock_result['acquired'],
            'locked_by_self': lock_result.get('locked_by_self', False),
        }))

        if lock_result['acquired']:
            await self._broadcast_locks()

    async def _handle_section_blur(self, data):
        section_id = data.get('section_id')
        if not section_id:
            return

        await database_sync_to_async(self._release_lock)(section_id)
        await self._broadcast_locks()

    async def _handle_content_update(self, data):
        section_id = data.get('section_id')
        content = data.get('content')

        if not section_id or content is None:
            return

        # Validate section belongs to this document and user has edit access
        is_valid = await database_sync_to_async(self._validate_section_update)(section_id)
        if not is_valid:
            return

        # Sanitize content
        import re
        content = re.sub(r'<script[^>]*>.*?</script>', '', content, flags=re.IGNORECASE | re.DOTALL)
        content = re.sub(r'\bon\w+\s*=\s*\S+', '', content, flags=re.IGNORECASE)

        # Limit content size
        if len(content) > 100000:
            return

        await self.channel_layer.group_send(
            self.document_group_name,
            {
                'type': 'content_broadcast',
                'section_id': section_id,
                'content': content,
                'sender_email': self.user.email,
            }
        )

    async def _handle_heartbeat(self, data):
        await database_sync_to_async(self._update_presence)()
        await self._broadcast_presence()
        await self._broadcast_locks()

    def _validate_section_update(self, section_id):
        from .models import Section, Document
        try:
            section = Section.objects.select_related('document').get(id=section_id)
        except Section.DoesNotExist:
            return False
        if section.document_id != int(self.document_id):
            return False
        doc = section.document
        return (
            doc.user == self.user
            or doc.collaborators.filter(id=self.user.id).exists()
        )

    async def content_broadcast(self, event):
        if event.get('sender_email') == self.user.email:
            return
        await self.send(text_data=json.dumps({
            'type': 'content_update',
            'section_id': event['section_id'],
            'content': event['content'],
        }))

    async def presence_broadcast(self, event):
        await self.send(text_data=json.dumps({
            'type': 'presence_update',
            'active_users': event['active_users'],
        }))

    async def locks_broadcast(self, event):
        await self.send(text_data=json.dumps({
            'type': 'locks_update',
            'locks': event['locks'],
        }))

    def _check_access(self):
        from .models import Document
        try:
            doc = Document.objects.get(id=self.document_id)
        except Document.DoesNotExist:
            return False
        return (
            doc.user == self.user
            or doc.collaborators.filter(id=self.user.id).exists()
            or doc.commenters.filter(id=self.user.id).exists()
            or doc.viewers.filter(id=self.user.id).exists()
        )

    def _add_presence(self):
        from .models import DocumentPresence
        doc_id = int(self.document_id)
        DocumentPresence.objects.get_or_create(
            document_id=doc_id, user=self.user
        )

    def _remove_presence(self):
        from .models import DocumentPresence
        doc_id = int(self.document_id)
        DocumentPresence.objects.filter(document_id=doc_id, user=self.user).delete()

    def _update_presence(self):
        from .models import DocumentPresence
        doc_id = int(self.document_id)
        presence, _ = DocumentPresence.objects.get_or_create(
            document_id=doc_id, user=self.user
        )
        presence.save()  # auto_now updates last_active

    def _acquire_lock(self, section_id):
        from .models import SectionLock, Section

        # Verify section belongs to this document
        if not Section.objects.filter(id=section_id, document_id=int(self.document_id)).exists():
            return {'acquired': False}

        lock = SectionLock.objects.filter(section_id=section_id).first()
        if lock:
            if lock.user == self.user:
                lock.save()  # auto_now updates locked_at
                return {'acquired': True, 'locked_by_self': True}
            if lock.locked_at < timezone.now() - timedelta(seconds=20):
                lock.delete()
            else:
                return {'acquired': False}

        SectionLock.objects.create(section_id=section_id, user=self.user)
        return {'acquired': True, 'locked_by_self': False}

    def _release_lock(self, section_id):
        from .models import SectionLock
        SectionLock.objects.filter(section_id=section_id, user=self.user).delete()

    def _release_all_locks(self):
        from .models import SectionLock
        doc_id = int(self.document_id)
        SectionLock.objects.filter(
            section__document_id=doc_id, user=self.user
        ).delete()

    def _save_content(self, section_id, content):
        from .models import Section
        try:
            section = Section.objects.get(id=section_id, document_id=int(self.document_id))
            section.content = content
            section.save()
        except Section.DoesNotExist:
            pass

    async def _broadcast_presence(self):
        active_users = await database_sync_to_async(self._get_active_users)()
        await self.channel_layer.group_send(
            self.document_group_name,
            {
                'type': 'presence_broadcast',
                'active_users': active_users,
            }
        )

    async def _broadcast_locks(self):
        locks = await database_sync_to_async(self._get_locks)()
        await self.channel_layer.group_send(
            self.document_group_name,
            {
                'type': 'locks_broadcast',
                'locks': locks,
            }
        )

    def _get_active_users(self):
        from .models import DocumentPresence
        from .serializers import UserSerializer
        doc_id = int(self.document_id)

        cutoff = timezone.now() - timedelta(seconds=15)
        DocumentPresence.objects.filter(document_id=doc_id, last_active__lt=cutoff).delete()

        presences = DocumentPresence.objects.filter(document_id=doc_id)
        return [UserSerializer(p.user).data for p in presences]

    def _get_locks(self):
        from .models import SectionLock
        doc_id = int(self.document_id)

        cutoff = timezone.now() - timedelta(seconds=20)
        SectionLock.objects.filter(
            section__document_id=doc_id, locked_at__lt=cutoff
        ).delete()

        locks = {}
        for lock in SectionLock.objects.filter(section__document_id=doc_id):
            locks[str(lock.section_id)] = {
                'email': lock.user.email,
                'name': f"{lock.user.first_name} {lock.user.last_name}".strip() or lock.user.username,
                'locked_at': lock.locked_at.isoformat(),
            }
        return locks
