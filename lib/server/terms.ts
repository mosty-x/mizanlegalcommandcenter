import "server-only";
export function currentTermsVersion():string{return process.env.TERMS_VERSION?.trim()||"2026-09-04";}
