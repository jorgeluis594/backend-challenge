export type ClinicId = string & { readonly __brand: 'ClinicId' };
export type Timezone = string & { readonly __brand: 'Timezone' }; // an IANA zone that exists
export type Clinic = Readonly<{ id: ClinicId; name: string; timezone: Timezone }>;
