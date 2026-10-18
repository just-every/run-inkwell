import type { Envelope } from '../inkwell/model'

/** A moment in Columbus time: [days ago, 'HH:MM' Eastern], or minutes ago for this morning's work. */
export type When = [number, string] | number
export interface Agreement {
  title: string
  /** Signers in order; the owner signs as herself (OWNER) with her own sign-in address. */
  signers: string[]
  status: Envelope['status']
  prepared: When
  approved?: When
  /** One time per signer who has signed, in order. */
  signed?: When[]
  voided?: { at: When; reason: string }
  /** Prepared by the workspace's preparation agent rather than a person. */
  agent?: true
}
export const OWNER = 'Rosa Delgado'

// Harborline Facility Services, a commercial cleaning firm in Columbus, Ohio: the fortnight the run site tells, as the
// operations manager Rosa Delgado sees it on a Monday morning. Lakeshore Dental and Brightwater Medical keep the
// homepage's own records.
export const agreements: Agreement[] = [
  { title: 'Cedar Row Property Mgmt · Service Agreement + W-9', signers: ['Luis Ortega', 'Dana Whitfield', OWNER], status: 'prepared', prepared: 49, agent: true },
  { title: 'Maya Ortiz · Offer letter', signers: [OWNER, 'Maya Ortiz'], status: 'awaiting_signature', prepared: 110, approved: 96 },
  { title: 'Ohio Valley Logistics · Service Agreement v3', signers: ['Tom Alvarez', 'Karen Liu', OWNER], status: 'awaiting_signature', prepared: [4, '10:02'], approved: [4, '10:06'], signed: [[1, '16:20']] },
  { title: 'Riverside Family Clinic · Change order 2', signers: ['Dr. Alan Brooks', OWNER], status: 'awaiting_signature', prepared: [5, '13:40'], approved: [5, '13:44'], signed: [[3, '14:05']] },
  { title: 'Great Lakes Office Park · Cleaning services agreement', signers: ['Paul Novak', 'Linda Shaw', OWNER], status: 'awaiting_signature', prepared: [5, '09:15'], approved: [5, '09:20'], signed: [[3, '09:40']] },
  { title: 'Summit Ridge HOA · Janitorial renewal', signers: ['Grace Kim', OWNER], status: 'awaiting_signature', prepared: [3, '11:20'], approved: [3, '11:30'] },
  { title: 'Buckeye Staffing · Subcontractor agreement', signers: ['Marcus Hill', OWNER], status: 'awaiting_signature', prepared: [4, '15:10'], approved: [4, '15:30'] },
  { title: 'Keystone Supply Co · Mutual NDA', signers: ['Erin Walsh', OWNER], status: 'awaiting_signature', prepared: [5, '14:00'], approved: [5, '14:05'] },
  { title: 'Jordan Reyes · W-9 packet', signers: ['Jordan Reyes'], status: 'completed', prepared: [4, '16:00'], approved: [4, '16:02'], signed: [[1, '19:15']] },
  { title: 'Brightwater Medical · Service Agreement + W-9', signers: ['Dr. Amy Chen', 'Mark Ellis', OWNER], status: 'completed', prepared: [7, '16:10'], approved: [6, '09:12'], signed: [[6, '13:30'], [4, '11:20'], [4, '14:41']] },
  { title: 'Lakeshore Dental · NDA', signers: ['Dr. Priya Raman'], status: 'completed', prepared: [12, '09:00'], approved: [12, '09:05'], signed: [[6, '10:14']] },
  { title: 'German Village Lofts · Window cleaning agreement', signers: ['Nina Castillo', OWNER], status: 'completed', prepared: [13, '10:30'], approved: [13, '10:35'], signed: [[11, '15:45'], [10, '09:10']] },
  { title: 'Polaris Fitness · Service agreement', signers: ['Derek Holt', OWNER], status: 'completed', prepared: [14, '11:00'], approved: [14, '11:05'], signed: [[13, '16:30'], [12, '08:55']] },
  { title: 'Franklin County Library · Custodial services renewal', signers: ['Janet Moore', 'Victor Shah', OWNER], status: 'completed', prepared: [17, '09:30'], approved: [17, '09:40'], signed: [[14, '13:15'], [13, '10:20'], [12, '09:05']] },
  { title: 'Clintonville Pediatrics · Service Agreement v3', signers: ['Dr. Hannah Ford', OWNER], status: 'completed', prepared: [21, '14:00'], approved: [21, '14:05'], signed: [[19, '11:30'], [18, '09:45']] },
  { title: 'Easton Dental Studio · W-9', signers: ['Kevin Pham'], status: 'completed', prepared: [24, '10:00'], approved: [24, '10:02'], signed: [[20, '17:25']] },
  { title: 'Arena District Events · Event cleanup quote', signers: ['Sara Lindqvist', OWNER], status: 'voided', prepared: [12, '13:00'], approved: [12, '13:05'], voided: { at: [10, '10:30'], reason: 'Replaced by the revised quote after the event moved to Sat Nov 7.' } },
  { title: 'Short North Gallery · Service agreement', signers: ['Owen Price', OWNER], status: 'expired', prepared: [17, '15:00'], approved: [17, '15:10'] },
]

export const emailFor = (name: string) => name.toLowerCase().replace(/^dr\.\s+/, '').replace(/[^a-z]+/g, '.') + '@example.com'
