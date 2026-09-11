import { useState, type FormEvent } from 'react';
import { useCreateItem } from '@repo/api-contract';
import { Button } from '@repo/ui/primitives/button';
import { Input } from '@repo/ui/primitives/input';
import { Textarea } from '@repo/ui/primitives/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@repo/ui/primitives/dialog';
import { FormField } from '@repo/ui/composites/form-field';
import { ProblemError } from '@/lib/http/problem-error';

export function CreateItemDialog() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const createItem = useCreateItem({
    onSuccess: () => {
      setOpen(false);
      setTitle('');
      setDescription('');
    },
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    createItem.mutate({ title, description: description || undefined });
  }

  // Field-level errors from a 422 map straight onto the form the same way
  // react-hook-form's setError would (doc 04 section 3.4); kept manual here
  // to avoid pulling in a form library for a two-field dialog.
  const titleError =
    createItem.error instanceof ProblemError
      ? createItem.error.invalidParams?.find((p) => p.name === 'title')?.reason
      : undefined;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>New item</Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Create item</DialogTitle>
          </DialogHeader>
          <FormField label="Title" error={titleError}>
            {(control) => (
              <Input {...control} required value={title} onChange={(e) => setTitle(e.target.value)} />
            )}
          </FormField>
          <FormField label="Description">
            {(control) => (
              <Textarea
                {...control}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            )}
          </FormField>
          <DialogFooter>
            <Button type="submit" disabled={createItem.isPending}>
              {createItem.isPending ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
