import * as admin from 'firebase-admin';
import { onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.database();
const messaging = admin.messaging();

// Optional secret for email delivery via SendGrid
const SENDGRID_API_KEY = defineSecret('SENDGRID_API_KEY');

type InscricaoPayload = {
  missaoId: string;
  turnoId: string;
};

export const onInscricaoRequest = onCall<InscricaoPayload>(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    return { ok: false, reason: 'unauthenticated' };
  }
  const { missaoId, turnoId } = request.data || {};
  if (!missaoId || !turnoId) return { ok: false, reason: 'invalid-args' };

  const turnoRef = db.ref(`/missoes/${missaoId}/turnos/${turnoId}`);
  const inscricaoRef = db.ref(`/inscricoes/${missaoId}/${turnoId}/${uid}`);

  // Carrega turno para verificar conflitos de horário do usuário
  const turnoSnap = await turnoRef.get();
  const turno = turnoSnap.val();
  if (!turno) return { ok: false, reason: 'turno-inexistente' };

  // Verifica conflitos: procura inscrições do usuário na mesma data e faixa de horário
  const userDayRef = db.ref(`/inscricoes/${missaoId}`);
  const allInscricoesSnap = await userDayRef.get();
  const allInscricoes = allInscricoesSnap.val() || {};
  const hasConflict = Object.values(allInscricoes).some((turnoMap: any) => {
    const u = turnoMap?.[uid];
    if (!u || u.status === 'cancelado') return false;
    // Missões diferentes podem conflitar; aqui simplificamos: conflito se sobrepõe horário na mesma data
    return u.data === turno.data && !(u.fim <= turno.inicio || u.inicio >= turno.fim);
  });
  if (hasConflict) return { ok: false, reason: 'conflito-de-horario' };

  // Transação para decrementar vaga
  const res = await turnoRef.transaction(
    (current) => {
      if (!current) return current;
      if (current.vagasDisponiveis > 0) {
        return { ...current, vagasDisponiveis: current.vagasDisponiveis - 1 };
      }
      return current; // sem alteração => não comita
    },
    undefined,
    false
  );

  if (!res.committed) {
    return { ok: false, reason: 'vagas-esgotadas' };
  }

  // Cria inscrição
  const userSnap = await db.ref(`/usuarios/${uid}`).get();
  const user = userSnap.val();
  await inscricaoRef.set({
    userId: uid,
    nome: user?.nome || '',
    matricula: user?.matricula || '',
    status: 'inscrito',
    timestamp: Date.now(),
    data: turno.data,
    inicio: turno.inicio,
    fim: turno.fim,
  });

  // Log
  const logRef = db.ref('/logs').push();
  await logRef.set({ acao: 'inscricao', userId: uid, detalhes: { missaoId, turnoId }, timestamp: Date.now() });

  // Notificações (FCM + email) — placeholders
  try {
    const token = user?.fcmToken;
    if (token) {
      await messaging.send({ token, notification: { title: 'Inscrição confirmada', body: `Missão ${missaoId} turno ${turnoId}` } });
    }
    // Envio de e-mail: integrar com SendGrid via Web API (chave em secrets/CI)
  } catch (e) {
    console.warn('Falha ao enviar notificação', e);
  }

  return { ok: true };
});

type CancelPayload = {
  missaoId: string;
  turnoId: string;
};

export const onCancelamento = onCall<CancelPayload>(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) return { ok: false, reason: 'unauthenticated' };
  const { missaoId, turnoId } = request.data || {};
  const cancelConfigSnap = await db.ref('/config/cancelamentoHorasAntes').get();
  const cancelHours = cancelConfigSnap.val() ?? 4; // padrão 4h

  const turnoRef = db.ref(`/missoes/${missaoId}/turnos/${turnoId}`);
  const turnoSnap = await turnoRef.get();
  const turno = turnoSnap.val();
  if (!turno) return { ok: false, reason: 'turno-inexistente' };
  const start = new Date(`${turno.data}T${turno.inicio}:00`).getTime();
  const now = Date.now();
  const diffHours = (start - now) / (1000 * 60 * 60);
  if (diffHours < cancelHours) return { ok: false, reason: 'fora-da-janela' };

  // Marca cancelado e restaura vaga
  const inscricaoRef = db.ref(`/inscricoes/${missaoId}/${turnoId}/${uid}`);
  await inscricaoRef.update({ status: 'cancelado', canceladoEm: Date.now() });
  await turnoRef.transaction(
    (current) => {
      if (!current) return current;
      return { ...current, vagasDisponiveis: Math.min(current.vagasTotais, (current.vagasDisponiveis || 0) + 1) };
    },
    undefined,
    false
  );

  const logRef = db.ref('/logs').push();
  await logRef.set({ acao: 'cancelamento', userId: uid, detalhes: { missaoId, turnoId }, timestamp: Date.now() });

  return { ok: true };
});

export const cronCleanup = onSchedule('every monday 03:00', async () => {
  // Placeholder: arquivar missões passadas
  const now = Date.now();
  const missoesSnap = await db.ref('/missoes').get();
  const updates: Record<string, any> = {};
  missoesSnap.forEach((missionSnap) => {
    const missionId = missionSnap.key!;
    const mission = missionSnap.val();
    const hasPast = Object.values(mission.turnos || {}).some((t: any) => new Date(`${t.data}T${t.fim}:00`).getTime() < now);
    if (hasPast) updates[`/missoes/${missionId}/archived`] = true;
  });
  if (Object.keys(updates).length) await db.ref('/').update(updates);
});

type NotifyEscalaPayload = {
  unit: string;
  date: string; // YYYY-MM-DD
  escalaId: string;
};

// Dispara notificações push e email para efetivo escalado ao gerar a escala
export const notifyEscalaGerada = onCall<{ unit: string; date: string; escalaId: string }>(
  { secrets: [SENDGRID_API_KEY] },
  async (request) => {
    // Apenas admins de unidade/autenticados devem poder chamar
    const uid = request.auth?.uid;
    if (!uid) return { ok: false, reason: 'unauthenticated' };
    const { unit, date, escalaId } = request.data || ({} as NotifyEscalaPayload);
    if (!unit || !date || !escalaId) return { ok: false, reason: 'invalid-args' };

    const monthKey = (date || '').slice(0, 7);
    const escalaRef = db.ref(`/units/${unit}/escalas/${monthKey}/${escalaId}`);
    const escalaSnap = await escalaRef.get();
    const escala = escalaSnap.val();
    if (!escala) return { ok: false, reason: 'escala-not-found' };

    const efetivo: Record<string, any> = escala.efetivo || {};
    const uids = Object.keys(efetivo);
    if (uids.length === 0) return { ok: true, sent: 0 };

    const titulo: string = escala.titulo || 'Escala';
    const referencia: string = escala.referencia || '';
    const local: string = escala.local || '';
    const inicio: string = escala.inicio || '';
    const fim: string = escala.fim || '';
    const body = `${date} • ${referencia || local} • ${inicio || ''}${fim ? ` - ${fim}` : ''}`.trim();

    // Carrega perfis para email e tokens FCM
    const tokens: string[] = [];
    const emails: string[] = [];
    const namesByEmail: Record<string, string> = {};
    for (const targetUid of uids) {
      try {
        const profSnap = await db.ref(`/users/${targetUid}/profile`).get();
        const prof = profSnap.val() || {};
        const tokenSnap = await db.ref(`/users/${targetUid}/fcmToken`).get();
        const token = tokenSnap.val();
        if (token) tokens.push(token);
        const email: string | undefined = prof.email || efetivo[targetUid]?.email || undefined;
        if (email) {
          emails.push(email);
          namesByEmail[email] = prof.nomeGuerra || prof.nomeCompleto || efetivo[targetUid]?.nome || targetUid;
        }
      } catch {
        // ignore permission errors
      }
    }

    // Envia push por FCM (multicast)
    let pushCount = 0;
    if (tokens.length > 0) {
      try {
        const res = await messaging.sendMulticast({
          tokens,
          notification: {
            title: `Escala gerada: ${titulo}`,
            body,
          },
          data: {
            unit,
            date,
            escalaId,
            referencia,
            local,
          },
        });
        pushCount = res.successCount || 0;
      } catch (e) {
        console.warn('Falha FCM notifyEscalaGerada', e);
      }
    }

    // Envia email via SendGrid, se configurado
    let emailCount = 0;
    const sgApiKey = SENDGRID_API_KEY.value();
    if (sgApiKey && emails.length > 0) {
      try {
        const sgMail = await import('@sendgrid/mail');
        sgMail.default.setApiKey(sgApiKey);
        const msg = {
          from: 'no-reply@abonoextra.altacode.dev',
          subject: `Escala gerada: ${titulo}`,
          html: `<p>Você foi escalado para <strong>${titulo}</strong> (${referencia || local}) em <strong>${date}</strong>, horário <strong>${inicio}${fim ? ` - ${fim}` : ''}</strong>.</p>`,
        } as any;
        const personals = emails.map((to) => ({ to, ...msg, name: namesByEmail[to] }));
        const resp = await sgMail.default.send(personals, false);
        emailCount = Array.isArray(resp) ? resp.length : emails.length;
      } catch (e) {
        console.warn('Falha SendGrid notifyEscalaGerada', e);
      }
    }

    // Log simples
    await db.ref('/logs').push({
      acao: 'notify-escala-gerada',
      detalhes: { unit, date, escalaId, pushCount, emailCount },
      timestamp: Date.now(),
    });

    return { ok: true, pushCount, emailCount };
  }
);