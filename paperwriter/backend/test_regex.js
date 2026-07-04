const latex = 
\\section{Introduction}
Welcome to PaperWriter!

\\section{Methodology}
Our methodology...

\\bibliographystyle{IEEEtran}
\\bibliography{references}
\\end{document}
;
const sectionRegex = /\\(section|subsection|subsubsection)\{([^}]+)\}([\s\S]*?)(?=\\(section|subsection|subsubsection)\{|\\bibliographystyle|\\end\{document\})/g;
let match;
while ((match = sectionRegex.exec(latex)) !== null) {
    console.log("Found section:", match[2]);
}
