import * as admin from 'firebase-admin';
import { onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';

if (!admin.apps.length) {
  admin.initializeApp();
}


const db = admin.database();
const messaging = admin.messaging();

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
    const res = await turnoRef.transaction((current) => {
      if (!current) return current;
      if (current.vagasDisponiveis > 0) {
        return { ...current, vagasDisponiveis: current.vagasDisponiveis - 1 };
      }
      return current; // sem alteração => não comita
    }, undefined, false);

    if (!res.committed) {
      return { ok: false, reason: 'vagas-esgotadas' };
    }

    // Cria inscrição
    const userSnap = await db.ref(`/usuarios/${uid}`).get();
    const user = userSnap.val();
    const tokenSnap = await db.ref(`/users/${uid}/fcmToken`).get();
    const fcmToken = tokenSnap.val();
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
      const token = fcmToken;
      if (token) {
        await messaging.send({
          token,
          notification: { title: 'Inscrição confirmada', body: `Missão ${missaoId} turno ${turnoId}` },
          data: { link: `/missoes/${missaoId}` }
        });
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
  await turnoRef.transaction((current) => {
    if (!current) return current;
    return { ...current, vagasDisponiveis: Math.min(current.vagasTotais, (current.vagasDisponiveis || 0) + 1) };
  }, undefined, false);

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

type SendNotificationPayload = {
  unit?: string;
  date?: string;
  mission?: string;
  uids: string[];
  title?: string;
  body?: string;
  link?: string;
};

export const onSendEscalaNotification = onCall<SendNotificationPayload>(async (request) => {
  const callerUid = request.auth?.uid;
  if (!callerUid) return { ok: false, reason: 'unauthenticated' };
  const { unit, uids, title, body, link } = request.data || ({} as SendNotificationPayload);
  if (!Array.isArray(uids) || uids.length === 0) return { ok: false, reason: 'invalid-args' };
  if (unit) {
    try {
      const adminSnap = await db.ref(`/roles/${callerUid}/unitAdmin/${unit}`).get();
      const isUnitAdmin = adminSnap.exists() && adminSnap.val() === true;
      const generalSnap = await db.ref(`/roles/${callerUid}/generalAdmin`).get();
      const isGeneral = generalSnap.exists() && generalSnap.val() === true;
      if (!isUnitAdmin && !isGeneral) return { ok: false, reason: 'permission-denied' };
    } catch {
      return { ok: false, reason: 'permission-check-failed' };
    }
  }
  const titleFinal = title || 'Escala publicada';
  const bodyFinal = body || 'Você foi escalado. Confira seus detalhes.';
  const linkFinal = link || '/missoesPessoal';
  let sent = 0;
  const tokens: string[] = [];
  for (const uid of uids) {
    try {
      const devicesSnap = await db.ref(`/users/${uid}/fcmDevices`).get();
      const devices = devicesSnap.val() || {};
      Object.values(devices).forEach((d: any) => {
        const t = d?.token;
        const active = d?.active === true;
        if (active && typeof t === 'string' && t.length > 0) tokens.push(t);
      });
    } catch {}
  }
  const batches = tokens.map((token) =>
    messaging.send({
      token,
      notification: { title: titleFinal, body: bodyFinal },
      data: { link: linkFinal },
    }).then(() => { sent += 1; }).catch(() => {})
  );
  await Promise.all(batches);
  return { ok: true, sent };
});
