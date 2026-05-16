# OS ODYSSEY — Database

## Stack (Planned)
- **Database**: PostgreSQL  
- **ORM**: Prisma  

## Schema (Prisma)

```prisma
model User {
  id        String   @id @default(uuid())
  email     String   @unique
  password  String
  createdAt DateTime @default(now())
  progress  Progress[]
}

model Module {
  id          String   @id @default(uuid())
  chapter     Int
  title       String
  description String
  topics      Topic[]
}

model Topic {
  id       String  @id @default(uuid())
  title    String
  content  String
  moduleId String
  module   Module  @relation(fields: [moduleId], references: [id])
}

model Progress {
  id        String   @id @default(uuid())
  userId    String
  moduleId  String
  completed Boolean  @default(false)
  score     Int?
  updatedAt DateTime @updatedAt
  user      User     @relation(fields: [userId], references: [id])
}
```

## To Setup
```bash
cd database
npx prisma migrate dev --name init
npx prisma db seed
```
