from bs4 import BeautifulSoup

with open("response.html", "r", encoding="utf-8") as f:
    html = f.read()

soup = BeautifulSoup(html, "html.parser")

for card in soup.find_all(class_="poly-card"):
    # Print the full HTML of this card to see how details are laid out
    print(card.prettify()[:2000])
    break
