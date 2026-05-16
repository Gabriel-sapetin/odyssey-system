# OS ODYSSEY — Backend

## Stack (Planned)
- **Runtime**: Node.js + Express  
- **Auth**: JWT + bcrypt  
- **ORM**: Prisma  
- **DB**: PostgreSQL (see /database)

## Folder Structure
```
backend/
├── server.js          # Express entry point
├── routes/
│   ├── auth.js        # POST /api/auth/register, /login, /logout
│   ├── modules.js     # GET /api/modules, GET /api/modules/:id
│   └── progress.js    # GET/POST /api/progress/:userId
├── middleware/
│   └── authMiddleware.js
└── controllers/
    ├── authController.js
    ├── moduleController.js
    └── progressController.js
```

## API Endpoints (planned)
| Method | Route | Description |
|--------|-------|-------------|
| POST | /api/auth/register | Create new user |
| POST | /api/auth/login | Login, returns JWT |
| POST | /api/auth/logout | Invalidate token |
| GET | /api/modules | List all modules |
| GET | /api/modules/:id | Get single module |
| GET | /api/progress/:userId | Get user progress |
| POST | /api/progress/:userId | Update progress |

## To Start
```bash
cd backend
npm install
npm run dev
```
