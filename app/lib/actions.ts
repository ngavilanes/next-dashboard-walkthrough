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
const UpdateInvoice = formSchema.omit({ id: true, date: true });

export async function createInvoice(formData: FormData) {
  try {
    const { customerId, amount, status } = CreateInvoice.parse({
      customerId: formData.get('customerId'),
      amount: formData.get('amount'),
      status: formData.get('status'),
    });

    const amountInCents = amount * 100;
    const date = new Date().toISOString().split('T')[0];

    const { error } = await supabase
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
      revalidatePath('/dashboard/invoices');
      redirect('/dashboard/invoices');
    }
  } catch (error) {
    console.log('error', error);
    throw new Error('error creating invoice');
  }
}

export async function updateInvoice(id: string, formData: FormData) {
  const { customerId, amount, status } = UpdateInvoice.parse({
    customerId: formData.get('customerId'),
    amount: formData.get('amount'),
    status: formData.get('status'),
  });

  const amountInCents = amount * 100;

  const { data, error } = await supabase
    .from('invoices')
    .update([
      {
        customer_id: customerId,
        amount: amountInCents,
        status: status,
      },
    ])
    .eq('id', id);

  if (error) {
    throw new Error('error updating invoice');
  }
  console.log('inserted data', data);
  revalidatePath('/dashboard/invoices');
  redirect('/dashboard/invoices');
}

export async function deleteInvoice(id: string) {
  const { error } = await supabase
    .from('invoices') // The table name
    .delete() // Perform a delete operation
    .eq('id', id); // Filter the row to delete

  if (error) {
    throw new Error('error deleting invoice ');
  }
  revalidatePath('/dashboard/invoices');
}
