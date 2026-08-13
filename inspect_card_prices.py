from bs4 import BeautifulSoup

with open("response.html", "r", encoding="utf-8") as f:
    html = f.read()

soup = BeautifulSoup(html, "html.parser")

for card in soup.find_all(class_="poly-card"):
    print("CARD DETAILS:")
    
    # Title & Link
    title_el = card.find(class_="poly-component__title")
    title = title_el.text.strip() if title_el else "No Title"
    link = title_el["href"] if title_el else "No Link"
    print(f"Title: {title}")
    print(f"Link: {link}")
    
    # Image
    img_el = card.find("img", class_="poly-component__picture")
    img_url = img_el["src"] if img_el else "No Image"
    print(f"Image: {img_url}")
    
    # Let's inspect the pricing elements
    # Usually they contain classes like poly-component__price or andes-money-amount
    price_wrapper = card.find(class_="poly-component__price")
    if price_wrapper:
        print("Price wrapper classes:", price_wrapper.get("class", []))
        # Let's print all andes-money-amount tags inside
        amounts = price_wrapper.find_all(class_="andes-money-amount")
        for i, amount in enumerate(amounts):
            print(f"  Amount {i+1} class:", amount.get("class", []))
            print(f"  Amount {i+1} text:", amount.get_text().strip())
    else:
        # If not inside poly-component__price, let's find all andes-money-amount in the card
        amounts = card.find_all(class_="andes-money-amount")
        print(f"Found {len(amounts)} andes-money-amount tags directly in card:")
        for i, amount in enumerate(amounts):
            print(f"  Amount {i+1} text: {amount.get_text().strip()} | Class: {amount.get('class', [])}")
            
    # Discount
    discount_el = card.find(class_="poly-component__discount")
    discount = discount_el.text.strip() if discount_el else "No Discount tag"
    print(f"Discount tag text: {discount}")
    
    print("-" * 60)
    break
