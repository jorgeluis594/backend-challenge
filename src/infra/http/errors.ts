import type { Response } from 'express';
import { z } from 'zod';

type UseCaseError =
  | 'PATIENT_NOT_IN_CLINIC'
  | 'STARTS_AT_NOT_FUTURE'
  | 'CLINIC_NOT_FOUND'
  | 'PATIENT_NOT_FOUND'
  | 'APPOINTMENT_NOT_FOUND'
  | 'APPOINTMENT_CANCELLED'
  | 'APPOINTMENT_STARTED';

const httpErrors: Record<UseCaseError, Readonly<{ status: number; message: string }>> = {
  PATIENT_NOT_IN_CLINIC: { status: 400, message: 'The patient does not belong to that clinic' },
  STARTS_AT_NOT_FUTURE: { status: 400, message: 'startsAt must be in the future' },
  CLINIC_NOT_FOUND: { status: 404, message: 'Clinic not found' },
  PATIENT_NOT_FOUND: { status: 404, message: 'Patient not found' },
  APPOINTMENT_NOT_FOUND: { status: 404, message: 'Appointment not found' },
  APPOINTMENT_CANCELLED: { status: 409, message: 'The appointment is cancelled' },
  APPOINTMENT_STARTED: { status: 409, message: 'The appointment has already started' },
};

export function sendError(res: Response, error: UseCaseError): void {
  const { status, message } = httpErrors[error];
  res.status(status).json({ error: message });
}

export function sendInvalidBody(res: Response, error: z.ZodError): void {
  res.status(400).json({ error: z.prettifyError(error) });
}
