import os
import re
import urllib.request

HTML_FILES = [
    'index.html',
    'admin.html',
    'browse.html',
    'report-lost.html',
    'report-found.html'
]

IMG_DIR = 'img'
os.makedirs(IMG_DIR, exist_ok=True)

url_to_path = {}

for html_file in HTML_FILES:
    if not os.path.exists(html_file):
        continue
        
    with open(html_file, 'r', encoding='utf-8') as f:
        content = f.read()
        
    urls = re.findall(r'src="(https://lh3.googleusercontent.com/[^"]+)"', content)
    
    for url in urls:
        if url not in url_to_path:
            idx = len(url_to_path) + 1
            local_name = f'stitch_asset_{idx}.jpg'
            local_path = os.path.join(IMG_DIR, local_name)
            print(f"Downloading {url[:50]}... to {local_path}")
            try:
                urllib.request.urlretrieve(url, local_path)
            except Exception as e:
                print(f"Failed to download {url}: {e}")
            url_to_path[url] = f'img/{local_name}'
            
    for url, local_rel_path in url_to_path.items():
        content = content.replace(url, local_rel_path)
        
    with open(html_file, 'w', encoding='utf-8') as f:
        f.write(content)
        
print("Done extracting and downloading images.")
