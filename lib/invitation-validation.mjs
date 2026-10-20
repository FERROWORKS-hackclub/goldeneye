import {z} from 'zod';
export const acceptanceSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('preview'),token:z.string().regex(/^[A-Za-z0-9_-]{43}$/)}),
 z.object({action:z.literal('accept'),token:z.string().regex(/^[A-Za-z0-9_-]{43}$/),name:z.string().trim().min(1).max(200),email:z.email().max(254).transform(value=>value.toLowerCase()),password:z.string().min(12).max(128).regex(/[a-z]/).regex(/[A-Z]/).regex(/[0-9]/).regex(/[^A-Za-z0-9]/)})
]);
