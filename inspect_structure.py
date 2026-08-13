from bs4 import BeautifulSoup

with open("response.html", "r", encoding="utf-8") as f:
    html = f.read()

soup = BeautifulSoup(html, "html.parser")

# Let's inspect the cards containing these product links.
# Usually, Mercado Livre uses promotion-item or similar, but let's see.
# Let's find an anchor tag that links to a product page and look at its ancestors.
for a in soup.find_all("a", href=True):
    href = a["href"]
    if "notebook-positivo-vision-i15m" in href:
        print("Found notebook link! Let's inspect its structure:")
        print("Tag name:", a.name)
        print("Attributes:", a.attrs)
        # Print parent elements up to 4 levels
        curr = a
        for i in range(4):
            curr = curr.parent
            if curr:
                print(f"Parent {i+1}: Tag={curr.name}, Classes={curr.get('class', [])}")
        
        # Print the text inside the whole structure of parent 2 or 3
        print("\nParent 2 inner text:")
        print(a.parent.parent.get_text(separator=" | ").strip())
        
        # Let's print the HTML snippet of parent 2 or 3 to inspect
        print("\nParent 3 HTML snippet:")
        print(a.parent.parent.parent.prettify()[:1000])
        break
