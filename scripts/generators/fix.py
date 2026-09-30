import os

def fix_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    content = content.replace('new NextResponse(buffer,', 'new NextResponse(new Uint8Array(buffer),')
    content = content.replace('new NextResponse(content,', 'new NextResponse(new Uint8Array(content),')

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

fix_file('src/app/api/export/pdf/route.ts')
fix_file('src/app/api/export/portfolio/route.ts')
fix_file('src/app/api/export/pptx/route.ts')
print("Fixed files.")
