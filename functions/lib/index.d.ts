type InscricaoPayload = {
    missaoId: string;
    turnoId: string;
};
export declare const onInscricaoRequest: import("firebase-functions/v2/https").CallableFunction<InscricaoPayload, any>;
type CancelPayload = {
    missaoId: string;
    turnoId: string;
};
export declare const onCancelamento: import("firebase-functions/v2/https").CallableFunction<CancelPayload, any>;
export declare const cronCleanup: import("firebase-functions/v2/scheduler").ScheduleFunction;
type SendNotificationPayload = {
    unit?: string;
    date?: string;
    mission?: string;
    uids: string[];
    title?: string;
    body?: string;
    link?: string;
};
export declare const onSendEscalaNotification: import("firebase-functions/v2/https").CallableFunction<SendNotificationPayload, any>;
export {};
