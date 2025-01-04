import { db } from '@vercel/postgres';
import {
  //CustomerField,
  CustomersTableType,
  InvoiceForm,
  InvoicesTable,
  Revenue,
  // LatestInvoiceRaw,
} from './definitions';
import { supabase } from './supaBaseClient';
import { formatCurrency } from './utils';

export async function fetchRevenue(): Promise<Revenue[]> {
  try {
    const { data: revenue, error } = await supabase.from('revenue').select('*');
    if (error) {
      return [];
    }
    return revenue;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch revenue data.');
  }
}

export async function fetchLatestInvoices() {
  try {
    const { data, error } = await supabase.from('recent_invoices').select('*');

    if (error) {
      console.error('Error fetching recent invoices:', error);
    } else {
      const latestInvoices = data?.map((invoice) => ({
        ...invoice,
        amount: formatCurrency(invoice.amount),
      }));
      return latestInvoices;
    }
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch the latest invoices.');
  }
}

export async function fetchCardData() {
  try {
    // Define all queries
    const invoiceCountPromise = supabase
      .from('invoices')
      .select('*', { count: 'exact', head: true }); // Count invoices

    const customerCountPromise = supabase
      .from('customers')
      .select('*', { count: 'exact', head: true }); // Count customers

    const invoiceStatusPromise = supabase.from('invoice_status').select('*');

    // Use Promise.all to fetch data in parallel
    const [invoiceCount, customerCount, invoiceStatus] = await Promise.all([
      invoiceCountPromise,
      customerCountPromise,
      invoiceStatusPromise,
    ]);

    const numberOfInvoices = Number(invoiceCount?.count ?? '0');
    const numberOfCustomers = Number(customerCount?.count ?? '0');
    const totalPaidInvoices = formatCurrency(
      invoiceStatus?.data?.[0]?.paid ?? '0'
    );
    const totalPendingInvoices = formatCurrency(
      invoiceStatus?.data?.[0]?.pending ?? '0'
    );

    return {
      numberOfCustomers,
      numberOfInvoices,
      totalPaidInvoices,
      totalPendingInvoices,
    };
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch card data.');
  }
}

const ITEMS_PER_PAGE = 6;
export async function fetchFilteredInvoices(
  query: string,
  currentPage: number
): Promise<InvoicesTable[]> {
  const offset = (currentPage - 1) * ITEMS_PER_PAGE;
  try {
    const { data, error } = await supabase
      .from('invoices_with_cast')
      .select('*')
      .or(
        `status.ilike.%${query}%,amount_text.ilike.%${query},customer_name.ilike.%${query}%,customer_email.ilike.%${query}%`
      )
      .order('date_text', { ascending: false })
      .range(offset, offset + ITEMS_PER_PAGE - 1);

    console.log('data', data);

    if (error) {
      console.error('Query failed:', error.message);
    } else {
      console.log('Query succeeded:', data);
    }
    if (data) {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const transformedData: InvoicesTable[] = data.map((invoice: any) => {
        return {
          id: String(invoice.id),
          customer_id: String(invoice.customer_id),
          name: invoice?.customer_name || '', // fallback to empty if data doesn't exist
          email: invoice?.customer_email || '',
          image_url: invoice?.image_url || '',
          date: invoice.date_text,
          amount: invoice.amount_text,
          status: invoice.status,
        };
      });
      return transformedData;
    }
    return [];
  } catch (error) {
    console.error('Error fetching invoices:', error);
    throw new Error('Failed to fetch invoices');
  }
}

export async function fetchInvoicesPages(query: string) {
  try {
    const client = await db.connect();
    const count = await client.sql`SELECT COUNT(*)
    FROM invoices
    JOIN customers ON invoices.customer_id = customers.id
    WHERE
      customers.name ILIKE ${`%${query}%`} OR
      customers.email ILIKE ${`%${query}%`} OR
      invoices.amount::text ILIKE ${`%${query}%`} OR
      invoices.date::text ILIKE ${`%${query}%`} OR
      invoices.status ILIKE ${`%${query}%`}
  `;

    const totalPages = Math.ceil(Number(count.rows[0].count) / ITEMS_PER_PAGE);
    return totalPages;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch total number of invoices.');
  }
}

export async function fetchInvoiceById(id: string) {
  try {
    const client = await db.connect();
    const data = await client.sql<InvoiceForm>`
      SELECT
        invoices.id,
        invoices.customer_id,
        invoices.amount,
        invoices.status
      FROM invoices
      WHERE invoices.id = ${id};
    `;

    const invoice = data.rows.map((invoice) => ({
      ...invoice,
      // Convert amount from cents to dollars
      amount: invoice.amount / 100,
    }));

    return invoice[0];
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch invoice.');
  }
}

export async function fetchCustomers() {
  try {
    const { data, error } = await supabase
      .from('customers')
      .select(`id,name`)
      .order('name', { ascending: true });
    if (error) {
      console.log('error', error);
      throw new Error('Failed to fetch Customers');
    }
    return data;
  } catch (err) {
    console.error('Database Error:', err);
    throw new Error('Failed to fetch all customers.');
  }
}

export async function fetchFilteredCustomers(query: string) {
  try {
    const client = await db.connect();
    const data = await client.sql<CustomersTableType>`
		SELECT
		  customers.id,
		  customers.name,
		  customers.email,
		  customers.image_url,
		  COUNT(invoices.id) AS total_invoices,
		  SUM(CASE WHEN invoices.status = 'pending' THEN invoices.amount ELSE 0 END) AS total_pending,
		  SUM(CASE WHEN invoices.status = 'paid' THEN invoices.amount ELSE 0 END) AS total_paid
		FROM customers
		LEFT JOIN invoices ON customers.id = invoices.customer_id
		WHERE
		  customers.name ILIKE ${`%${query}%`} OR
        customers.email ILIKE ${`%${query}%`}
		GROUP BY customers.id, customers.name, customers.email, customers.image_url
		ORDER BY customers.name ASC
	  `;

    const customers = data.rows.map((customer) => ({
      ...customer,
      total_pending: formatCurrency(customer.total_pending),
      total_paid: formatCurrency(customer.total_paid),
    }));

    return customers;
  } catch (err) {
    console.error('Database Error:', err);
    throw new Error('Failed to fetch customer table.');
  }
}
