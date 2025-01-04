'use server'; //marks all functions here as server actions
import { z } from 'zod';
import { supabase } from './supaBaseClient';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

const formSchema = z.object({
  id: z.string(),
  customerId: z.string(),
  amount: z.coerce.number(),
  status: z.enum(['pending', 'paid']),
  date: z.string(),
});

const CreateInvoice = formSchema.omit({ id: true, date: true });

export async function createInvoice(formData: FormData) {
  console.log('formdata', formData);
  const { customerId, amount, status } = CreateInvoice.parse({
    customerId: formData.get('customerId'),
    amount: formData.get('amount'),
    status: formData.get('status'),
  });

  const amountInCents = amount * 100;
  console.log('amount in cents', amountInCents);
  const date = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('invoices')
    .insert([
      {
        customer_id: customerId,
        amount: amountInCents,
        status: status,
        date: date,
      },
    ])
    .select();
  if (error) {
    console.log(error);
    throw new Error('error inserting into invoices');
  } else {
    console.log('inserted data', data);
    revalidatePath('/dashboard/invoices');
    redirect('/dashboard/invoices');
  }
}
