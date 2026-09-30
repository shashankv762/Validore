import os
import glob
import re

BASE_DIR = r"c:\Users\2025\IIT DELHI\entrepreneur\aurexa"

def fix_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Fix width=36 to width={36}
    content = re.sub(r'width=(\d+)', r'width={\1}', content)
    content = re.sub(r'height=(\d+)', r'height={\1}', content)

    # Accessibility fixes
    # 1. charts
    content = re.sub(r'(<ResponsiveContainer\b[^>]*>)', r'<div tabIndex={0} aria-label="Data Chart" role="img" className="w-full">\1', content)
    content = content.replace('</ResponsiveContainer>', '</ResponsiveContainer></div>')

    # 2. Add aria-labels to buttons without text
    # Not easily regexable for just icons, but let's ensure forms are good.
    # The instructions specifically called out the "ASSUMPTION" labels.
    content = content.replace('<span className="text-amber-600 font-medium">ASSUMPTION</span>', 
                              '<span className="text-[#0A1628] bg-amber-200 px-1 py-0.5 rounded font-bold text-[10px]" aria-label="This is an assumption">ASSUMPTION</span>')
    content = content.replace('<span className="text-xs text-amber-600 font-normal">ASSUMPTION</span>',
                              '<span className="text-[#0A1628] bg-amber-200 px-1 py-0.5 rounded font-bold text-[10px]" aria-label="This is an assumption">ASSUMPTION</span>')

    # 3. Fix gold text on cream background
    # text-[#C8A860] -> text-[#8A6B29] (if it is text, assuming it is on light bg)
    content = content.replace('text-[#C8A860]', 'text-[#96792b]')
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

# Fix legal pages
for p in glob.glob(os.path.join(BASE_DIR, 'src/app/legal/**/*.tsx'), recursive=True):
    fix_file(p)

# Fix dashboard pages
for p in glob.glob(os.path.join(BASE_DIR, 'src/app/dashboard/**/*.tsx'), recursive=True):
    fix_file(p)
    
print("Fixes applied.")
