import jwt, time
import requests

BASE = "http://localhost:3100/api"
JWT_SECRET = "supersecret_jwt_key_trust_web_0.1"
USER_ID = "b7d4f038-a492-41d4-aa18-72545ad15bc3"
p = {'id': USER_ID, 'email': 'leo@leo', 'role': 'MEMBER', 'iat': int(time.time()), 'exp': int(time.time()) + 3600}
token = jwt.encode(p, JWT_SECRET, algorithm='HS256')
headers = {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}

# Reset task first
import mysql.connector
conn = mysql.connector.connect(host="localhost", user="trust_suite", password="root", database="trust_web")
cur = conn.cursor()
cur.execute("UPDATE Task SET status='IN_PROGRESS', completedAt=NULL WHERE id='test-t3'")
conn.commit()
cur.close()
conn.close()
print("Task reset to IN_PROGRESS")

# Now complete it
r = requests.post(f"{BASE}/tasks/test-t3/complete", headers=headers, json={"difficulty": 3})
print(f"Status: {r.status_code}")
print(f"Response: {r.text[:500]}")
