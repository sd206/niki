import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { usersRouter } from './routes/users';
import { familiesRouter } from './routes/families';
import { driveRouter } from './routes/drive';
import { tasksRouter } from './routes/tasks';
import { eventsRouter } from './routes/events';
import { vaultRouter } from './routes/vault';
import { calendarRouter } from './routes/calendar';
import { budgetsRouter } from './routes/budgets';
import { expensesRouter } from './routes/expenses';
import { savingsGoalsRouter } from './routes/savingsGoals';
import { errorHandler } from './middleware/errorHandler';

const app = express();

/**
 * CORS — explicit allowlist, never `origin: '*'`.
 *
 * Why this matters for Niki specifically:
 *  - Web traffic in production goes through Firebase Hosting's rewrite
 *    (/v1/** -> this Cloud Run service, same project), so it's same-origin
 *    and CORS doesn't even apply. This allowlist exists for local dev and
 *    for any browser-direct-to-Cloud-Run requests (previews, debugging).
 *  - Mobile (React Native) calls the SAME Firebase Hosting URL as web
 *    (https://niki-app-d035f.web.app/v1), not the raw Cloud Run URL — kept
 *    consistent with web even though Cloud Run now allows unauthenticated
 *    invocation, since routing both through Hosting keeps one canonical
 *    entry point. Native fetch() also doesn't send a browser Origin header,
 *    so CORS is a no-op for mobile either way — auth is what protects this
 *    API, not CORS.
 *  - Cloud Run runs with --allow-unauthenticated (Firebase Hosting's
 *    rewrite proxy forwards requests with no invoker identity to grant IAM
 *    to). The real security boundary is the Firebase ID token check in
 *    src/middleware/auth.ts, required on every route for both web and mobile.
 */
const allowedOrigins = [
  'https://niki-app-d035f.web.app',
  'https://niki-app-d035f.firebaseapp.com',
  'http://localhost:3000',
];

const corsOptions: cors.CorsOptions = {
  origin: allowedOrigins,
  allowedHeaders: ['Content-Type', 'Authorization'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true,
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use(helmet());
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));

app.get('/health', (_req: Request, res: Response) => res.json({ status: 'ok' }));

app.use('/v1/users', usersRouter);
app.use('/v1/families', familiesRouter);
app.use('/v1/families/:familyId/tasks', tasksRouter);
app.use('/v1/families/:familyId/events', eventsRouter);
app.use('/v1/families/:familyId/vault', vaultRouter);
app.use('/v1/families/:familyId/calendar', calendarRouter);
app.use('/v1/families/:familyId/budgets', budgetsRouter);
app.use('/v1/families/:familyId/expenses', expensesRouter);
app.use('/v1/families/:familyId/savings-goals', savingsGoalsRouter);
app.use('/v1/drive', driveRouter);

app.use((req: Request, res: Response, _next: NextFunction) => {
  res.status(404).json({ error: `No route for ${req.method} ${req.path}` });
});

app.use(errorHandler);

// Only start the HTTP server when run directly (node dist/index.js).
// When imported by a test or future serverless wrapper, require.main !== module
// and this is skipped — this is the exact fix that resolved an EADDRINUSE
// crash in Fount's Firebase Functions deploy, kept here as a guardrail
// even though Niki's API targets Cloud Run directly.
if (require.main === module) {
  const PORT = process.env.PORT ?? 8080;
  app.listen(PORT, () => console.log(`Niki API running on :${PORT}`));
}

export default app;
