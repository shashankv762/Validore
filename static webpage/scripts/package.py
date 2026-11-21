"""Package only public website files, with index.html at the ZIP root."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import hashlib

root = Path(__file__).resolve().parents[1]
public = root / 'public'
output = root / 'dist'
output.mkdir(exist_ok=True)
archive = output / 'validore-website.zip'
files = sorted(path for path in public.rglob('*') if path.is_file())
assert (public / 'index.html') in files
assert all(path.suffix.lower() not in {'.py', '.ts', '.env', '.map'} for path in files)
with ZipFile(archive, 'w', ZIP_DEFLATED, compresslevel=9) as zip:
    for path in files:
        zip.write(path, path.relative_to(public).as_posix())
with ZipFile(archive) as zip:
    assert zip.testzip() is None
    assert 'index.html' in zip.namelist()
digest = hashlib.sha256(archive.read_bytes()).hexdigest()
(output / 'validore-website.sha256').write_text(f'{digest}  {archive.name}\n', encoding='utf-8')
print(f'Packaged {len(files)} public files: {archive}\nSize: {archive.stat().st_size:,} bytes\nSHA-256: {digest}')
