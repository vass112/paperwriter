class TemplateRegistry:
    _templates = {}

    @classmethod
    def register(cls, template_cls):
        inst = template_cls()
        cls._templates[inst.id] = inst
        return template_cls

    @classmethod
    def get(cls, template_id):
        return cls._templates.get(template_id, cls._templates.get('ieee'))

    @classmethod
    def choices(cls):
        return [(t.id, t.name) for t in cls._templates.values()]

    @classmethod
    def default_sections(cls, template_id):
        t = cls.get(template_id)
        return t.default_sections if t else []
