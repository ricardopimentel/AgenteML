import os

def check_env():
    print("GEMINI_API_KEY present:", "GEMINI_API_KEY" in os.environ)
    if "GEMINI_API_KEY" in os.environ:
        print("GEMINI_API_KEY length:", len(os.environ["GEMINI_API_KEY"]))
    
    print("GOOGLE_API_KEY present:", "GOOGLE_API_KEY" in os.environ)
    if "GOOGLE_API_KEY" in os.environ:
        print("GOOGLE_API_KEY length:", len(os.environ["GOOGLE_API_KEY"]))
        
if __name__ == "__main__":
    check_env()
