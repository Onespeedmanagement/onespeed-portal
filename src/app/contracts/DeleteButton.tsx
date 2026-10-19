'use client';
import { deleteContract } from './actions';

export function DeleteButton({ id, vendor, back }: { id: string; vendor: string; back?: string }) {
  return (
    <form action={deleteContract} onSubmit={(e) => { if (!confirm(`Delete the ${vendor} contract and its files? This can't be undone.`)) e.preventDefault(); }}>
      <input type="hidden" name="id" value={id} />
      {back && <input type="hidden" name="back" value={back} />}
      <button className="btn danger" type="submit">Delete this contract and its files</button>
    </form>
  );
}
