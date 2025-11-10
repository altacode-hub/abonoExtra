"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.cronCleanup = exports.onCancelamento = exports.onInscricaoRequest = void 0;
const admin = __importStar(require("firebase-admin"));
const https_1 = require("firebase-functions/v2/https");
const scheduler_1 = require("firebase-functions/v2/scheduler");
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.database();
const messaging = admin.messaging();
exports.onInscricaoRequest = (0, https_1.onCall)(async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
        return { ok: false, reason: 'unauthenticated' };
    }
    const { missaoId, turnoId } = request.data || {};
    if (!missaoId || !turnoId)
        return { ok: false, reason: 'invalid-args' };
    const turnoRef = db.ref(`/missoes/${missaoId}/turnos/${turnoId}`);
    const inscricaoRef = db.ref(`/inscricoes/${missaoId}/${turnoId}/${uid}`);
    // Carrega turno para verificar conflitos de horário do usuário
    const turnoSnap = await turnoRef.get();
    const turno = turnoSnap.val();
    if (!turno)
        return { ok: false, reason: 'turno-inexistente' };
    // Verifica conflitos: procura inscrições do usuário na mesma data e faixa de horário
    const userDayRef = db.ref(`/inscricoes/${missaoId}`);
    const allInscricoesSnap = await userDayRef.get();
    const allInscricoes = allInscricoesSnap.val() || {};
    const hasConflict = Object.values(allInscricoes).some((turnoMap) => {
        const u = turnoMap?.[uid];
        if (!u || u.status === 'cancelado')
            return false;
        // Missões diferentes podem conflitar; aqui simplificamos: conflito se sobrepõe horário na mesma data
        return u.data === turno.data && !(u.fim <= turno.inicio || u.inicio >= turno.fim);
    });
    if (hasConflict)
        return { ok: false, reason: 'conflito-de-horario' };
    // Transação para decrementar vaga
    const res = await turnoRef.transaction((current) => {
        if (!current)
            return current;
        if (current.vagasDisponiveis > 0) {
            return { ...current, vagasDisponiveis: current.vagasDisponiveis - 1 };
        }
        return current; // sem alteração => não comita
    }, { applyLocally: false });
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
    }
    catch (e) {
        console.warn('Falha ao enviar notificação', e);
    }
    return { ok: true };
});
exports.onCancelamento = (0, https_1.onCall)(async (request) => {
    const uid = request.auth?.uid;
    if (!uid)
        return { ok: false, reason: 'unauthenticated' };
    const { missaoId, turnoId } = request.data || {};
    const cancelConfigSnap = await db.ref('/config/cancelamentoHorasAntes').get();
    const cancelHours = cancelConfigSnap.val() ?? 4; // padrão 4h
    const turnoRef = db.ref(`/missoes/${missaoId}/turnos/${turnoId}`);
    const turnoSnap = await turnoRef.get();
    const turno = turnoSnap.val();
    if (!turno)
        return { ok: false, reason: 'turno-inexistente' };
    const start = new Date(`${turno.data}T${turno.inicio}:00`).getTime();
    const now = Date.now();
    const diffHours = (start - now) / (1000 * 60 * 60);
    if (diffHours < cancelHours)
        return { ok: false, reason: 'fora-da-janela' };
    // Marca cancelado e restaura vaga
    const inscricaoRef = db.ref(`/inscricoes/${missaoId}/${turnoId}/${uid}`);
    await inscricaoRef.update({ status: 'cancelado', canceladoEm: Date.now() });
    await turnoRef.transaction((current) => {
        if (!current)
            return current;
        return { ...current, vagasDisponiveis: Math.min(current.vagasTotais, (current.vagasDisponiveis || 0) + 1) };
    }, { applyLocally: false });
    const logRef = db.ref('/logs').push();
    await logRef.set({ acao: 'cancelamento', userId: uid, detalhes: { missaoId, turnoId }, timestamp: Date.now() });
    return { ok: true };
});
exports.cronCleanup = (0, scheduler_1.onSchedule)('every monday 03:00', async () => {
    // Placeholder: arquivar missões passadas
    const now = Date.now();
    const missoesSnap = await db.ref('/missoes').get();
    const updates = {};
    missoesSnap.forEach((missionSnap) => {
        const missionId = missionSnap.key;
        const mission = missionSnap.val();
        const hasPast = Object.values(mission.turnos || {}).some((t) => new Date(`${t.data}T${t.fim}:00`).getTime() < now);
        if (hasPast)
            updates[`/missoes/${missionId}/archived`] = true;
    });
    if (Object.keys(updates).length)
        await db.ref('/').update(updates);
});
