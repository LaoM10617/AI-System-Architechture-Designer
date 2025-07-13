# run.py
import subprocess
import threading
import os
import time
import uvicorn

def run_node_server():
    # Change to the directory where server.js is located if needed
    subprocess.run(["node", "js/server.js"])

def run_fastapi():
    uvicorn.run("backend:app", host="0.0.0.0", port=8000, reload=True)

if __name__ == "__main__":
    # Start Node.js server in a separate thread
    node_thread = threading.Thread(target=run_node_server)
    node_thread.daemon = True
    node_thread.start()
    
    # Start FastAPI server in the main thread
    run_fastapi()