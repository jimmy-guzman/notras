import { app } from "@/api/app";

const handler = (req: Request) => app.fetch(req);

export const DELETE = handler;
export const GET = handler;
export const PATCH = handler;
export const POST = handler;
export const PUT = handler;
