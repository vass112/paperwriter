import re

latex = r'''
\section{Introduction}
Welcome to PaperWriter!

\section{Methodology}
Our methodology...

\end{document}
'''
pattern = r'\\(section|subsection|subsubsection)\{([^}]+)\}([\s\S]*?)(?=\\(section|subsection|subsubsection)\{|\\bibliographystyle|\\end\{document\})'
matches = re.findall(pattern, latex)
for m in matches:
    print("Found section:", m[1])
