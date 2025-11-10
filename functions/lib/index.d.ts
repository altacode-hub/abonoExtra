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
export {};
