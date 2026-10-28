import {NextResponse} from 'next/server';
import {publicSourceStatus} from '@/lib/research/configured-sources';
export async function GET(){return NextResponse.json(publicSourceStatus(),{headers:{'Cache-Control':'private, no-store'}});}
