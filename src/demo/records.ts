import type { Envelope } from '../inkwell/model'

export const agreements: { title: string; names: [string, string]; status: Envelope['status'] }[] = [
  { title: 'Cedar House · Interior design services', names: ['Maya Chen', 'Oliver Grant'], status: 'completed' },
  { title: 'Northstar Studio · Brand identity', names: ['Priya Shah', 'Daniel Brooks'], status: 'completed' },
  { title: 'Harbor Coffee · Equipment lease', names: ['Sophie Martin', 'James Wilson'], status: 'completed' },
  { title: 'Fern & Field · Photography license', names: ['Amelia Reed', 'Noah Bennett'], status: 'completed' },
  { title: 'Atlas Works · Consulting agreement', names: ['Ethan Clarke', 'Isla Thompson'], status: 'completed' },
  { title: 'Willow Clinic · Confidentiality agreement', names: ['Grace Walker', 'Leo Patel'], status: 'completed' },
  { title: 'Juniper Books · Distribution terms', names: ['Chloe Davis', 'Oscar Hughes'], status: 'completed' },
  { title: 'Saltwater Co · Supplier agreement', names: ['Lily Morgan', 'Henry Scott'], status: 'completed' },
  { title: 'Birch Workshop · Cancelled venue hire', names: ['Ava Robinson', 'Lucas Wood'], status: 'voided' },
  { title: 'Meadow Market · Revised purchase terms', names: ['Ella Wright', 'Jack Evans'], status: 'voided' },
  { title: 'Eastbank Collective · Previous proposal', names: ['Freya Green', 'Theo Adams'], status: 'expired' },
  { title: 'Summit Trails · Seasonal partnership', names: ['Zoe Hill', 'William King'], status: 'expired' },
  { title: 'Paper Crane · Website maintenance', names: ['Ruby Lewis', 'Arjun Mehta'], status: 'awaiting_signature' },
  { title: 'Oak & Stone · Project variation', names: ['Hannah Baker', 'Felix Turner'], status: 'awaiting_signature' },
  { title: 'Coastal Makers · Workshop booking', names: ['Eva Collins', 'Hugo Phillips'], status: 'awaiting_signature' },
  { title: 'Brightside Learning · Training services', names: ['Nora Mitchell', 'Sam Parker'], status: 'awaiting_signature' },
  { title: 'Riverbend Foods · Supply schedule', names: ['Alice Carter', 'Max Harrison'], status: 'awaiting_signature' },
  { title: 'Little Lantern · Event production', names: ['Clara Roberts', 'Ben Foster'], status: 'awaiting_signature' },
  { title: 'Greenroom Studio · Recording session', names: ['Ivy Richardson', 'Finn Kelly'], status: 'prepared' },
  { title: 'Westward Architects · Design brief', names: ['Lucy James', 'Adam Russell'], status: 'prepared' },
  { title: 'Copper Lane · Retail pop-up license', names: ['Emma Bell', 'Josh Murphy'], status: 'prepared' },
  { title: 'Lakeside Wellness · Service renewal', names: ['Olivia Hayes', 'Alex Cooper'], status: 'prepared' },
  { title: 'Sunday Social · Catering agreement', names: ['Mia Ward', 'Charlie Price'], status: 'prepared' },
  { title: 'Acorn Digital · Mutual confidentiality', names: ['Sarah Nguyen', 'Tom Mitchell'], status: 'prepared' },
]

export const emailFor = (name: string) => name.toLowerCase().replace(/[^a-z]+/g, '.') + '@example.com'
