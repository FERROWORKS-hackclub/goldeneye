import {NextResponse} from 'next/server';
import {webSession} from '../../../../lib/next-auth';
import {db} from '../../../../lib/server';
export const dynamic='force-dynamic';
export async function GET(){const session=await webSession();if(!session?.user?.id)return NextResponse.json({error:'Sign in required'},{status:401});const [user]=await db()`SELECT email,name FROM fw_users WHERE id=${session.user.id} AND active=true`;if(!user)return NextResponse.json({error:'Account unavailable'},{status:404});return NextResponse.json({name:user.name,email:user.email,required:!user.email.toLowerCase().endsWith('@ferroworks.org')},{headers:{'Cache-Control':'private, no-store'}})}
