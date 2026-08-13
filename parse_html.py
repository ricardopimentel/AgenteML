from bs4 import BeautifulSoup
import re

with open("response.html", "r", encoding="utf-8") as f:
    html = f.read()

soup = BeautifulSoup(html, "html.parser")
print("Title tag:", soup.title)
if soup.title:
    print("Title text:", soup.title.string)

# Let's search for potential classes or terms like "oferta", "desconto", "preço"
print("Length of HTML:", len(html))

# Print first 20 class names found in the HTML to understand what tags/classes are present
classes = set()
for tag in soup.find_all(class_=True):
    for c in tag["class"]:
        classes.add(c)
        if len(classes) >= 50:
            break
    if len(classes) >= 50:
        break

print("Some class names found:")
print(sorted(list(classes))[:40])

# Let's search for links containing "/p/" or "/MLB-" or "produto" to find product cards
product_links = []
for a in soup.find_all("a", href=True):
    href = a["href"]
    if "produto" in href or "/p/MLB" in href or "-MLB-" in href or "/MLB-" in href:
        product_links.append((a.text.strip()[:30], href[:80]))

print(f"\nFound {len(product_links)} potential product links. Showing top 10:")
for text, link in product_links[:10]:
    print(f"Text: {text} | Link: {link}")
