from bs4 import BeautifulSoup

with open("response.html", "r", encoding="utf-8") as f:
    html = f.read()

soup = BeautifulSoup(html, "html.parser")

for card in soup.find_all(class_="poly-card"):
    # Look for any text that has "% OFF" or "%" and "OFF" inside the card
    text_elements = card.find_all(text=True)
    off_texts = [text.strip() for text in text_elements if "OFF" in text]
    print("Product:", card.find(class_="poly-component__title").text.strip() if card.find(class_="poly-component__title") else "No Title")
    print("Found text with OFF:", off_texts)
    
    # Let's inspect the tag name and class of those elements containing OFF
    for text in text_elements:
        if "OFF" in text:
            parent = text.parent
            print(f"Parent tag: {parent.name}, classes: {parent.get('class', [])}, text: '{text.strip()}'")
            
    print("-" * 60)
    # Check 3 cards
    if len(off_texts) > 0:
        break
