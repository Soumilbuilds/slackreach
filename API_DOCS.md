# SlackReach API Documentation

Base URL: `https://app.slackreach.com`

---

## Create User Account

**Endpoint:** `POST /api/auth/users`

**Content-Type:** `application/json`

### Request Body

```json
{
  "email": "user@example.com",
  "password": "anypassword"
}
```

| Field      | Type   | Required | Rules                                  |
|------------|--------|----------|----------------------------------------|
| `email`    | string | Yes      | Must be valid email format. Auto-lowercased and trimmed. Must be unique. |
| `password` | string | Yes      | Any length (1+ characters).            |

### Success Response (201 Created)

```json
{
  "success": true,
  "user": {
    "id": 1,
    "email": "user@example.com",
    "createdAt": "2026-02-26T10:30:00.000Z"
  }
}
```

### Error Responses

| Status | Body | Reason |
|--------|------|--------|
| 400 | `{ "error": "Valid email is required." }` | Missing or invalid email |
| 400 | `{ "error": "Password is required." }` | Empty password |
| 409 | `{ "error": "User already exists with this email." }` | Email already taken |

### Example cURL

```bash
curl -X POST https://app.slackreach.com/api/auth/users \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "anypassword"}'
```

After account creation, redirect the user to `https://app.slackreach.com` where they can log in with the same email and password.
