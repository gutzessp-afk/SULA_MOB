import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { notificarIncidencia } from '@/lib/notificar';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  );
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const session = cookieStore.get('sula_session');

  if (!session?.value) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const {
      tipo = 'mensaje',
      mensaje,
      area_id,
      area_nombre = 'General',
      usuario_id,
      usuario_nombre = 'Sistema',
      prioridad = 'media',
      maquina,
      turno = 'matutino',
    } = body;

    if (!mensaje || mensaje.trim().length === 0) {
      return NextResponse.json({ error: 'El mensaje es obligatorio' }, { status: 401 });
    }

    const supabase = getSupabase();

    const insertData: Record<string, unknown> = {
      tipo,
      mensaje: mensaje.trim(),
      leido: false,
    };

    if (usuario_id) insertData.usuario_id = usuario_id;
    if (area_id) insertData.area_id = area_id;

    const { error: dbError } = await supabase.from('notificaciones').insert(insertData);

    if (dbError) {
      console.error('[notificar-route] Error BD:', dbError.message);
    }

    // Manda email con todos los datos nuevos
    const emailResult = await notificarIncidencia({
      tipo,
      area: area_nombre,
      mensaje: mensaje.trim(),
      reportadoPor: usuario_nombre,
      prioridad,
      maquina: maquina || undefined,
      turno,
    });

    return NextResponse.json({
      success: true,
      guardado: !dbError,
      emailEnviado: emailResult.ok,
      ...(dbError && { dbError: dbError.message }),
      ...(!emailResult.ok && { emailError: emailResult.error }),
    });
  } catch (err) {
    console.error('[notificar-route] Error:', err);
    return NextResponse.json({ error: 'Error procesando la solicitud' }, { status: 500 });
  }
}

export async function GET() {
  return new NextResponse('Method Not Allowed', { status: 405 });
}
