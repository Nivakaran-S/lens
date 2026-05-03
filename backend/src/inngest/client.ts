import { Inngest, EventSchemas } from 'inngest';

type Events = {
  'pack/uploaded': { data: { jobId: string } };
};

export const inngest = new Inngest({
  id: 'lens-api',
  schemas: new EventSchemas().fromRecord<Events>(),
});
