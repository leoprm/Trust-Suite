import jwt
import time

secret = 'supersecret_jwt_key_trust_web_0.1'

admin_payload = {
    'id': '92a08f1c-abf5-4002-8a4b-584d590d928c',
    'email': 'test@test.com',
    'role': 'ADMINISTRATOR',
    'iat': int(time.time()),
    'exp': int(time.time()) + 3600
}
admin_token = jwt.encode(admin_payload, secret, algorithm='HS256')
print(admin_token)
