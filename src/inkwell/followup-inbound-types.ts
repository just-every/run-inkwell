/** Reply custody is envelope data. No capability, raw attachment, or provider download URL belongs here. */
export interface FollowupReply {
  id: string
  receivedAt: string
  provider: 'resend' | 'twilio' | 'graph'
  providerMessageId: string
  automatic?: boolean
  verified: boolean
  senderLabel: 'provider-reported sender' | 'unverified sender, provider-reported'
  headers: {
    from: string
    to: string[]
    date: string
    subject: string
    messageId: string
    inReplyTo: string
    autoSubmitted: string
  }
  body: string | null
  bodyBytes: number
  bodyStatus: 'kept' | 'reply too large to keep'
  attachments: { name: string; type: string; size: number; sha256: string; status: 'not kept by Inkwell' }[]
}
