import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Calendar, LoadingState, Notice, Screen } from '../../../src/components';
import { useChefId } from '../../../src/features/chef';
import { chefService } from '../../../src/services';
import { useToast } from '../../../src/store';

/** Chef off-day calendar. Off-days exclude the chef from assignment on those dates. */
export default function ChefOffDays() {
  const chefId = useChefId();
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['chefOffDays', chefId], queryFn: () => chefService.getOffDays(chefId) });
  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => {
    if (query.data) setSelected(query.data);
  }, [query.data]);
  const save = useMutation({
    mutationFn: () => chefService.saveOffDays(chefId, selected),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chefOffDays', chefId] });
      useToast.getState().show('Off-days saved');
    },
  });
  const toggle = (key: string) => setSelected((s) => (s.includes(key) ? s.filter((d) => d !== key) : [...s, key].sort()));

  return (
    <Screen title="Off-days" subtitle="Tap dates you’re unavailable." footer={<Button title={`Save ${selected.length} off-day${selected.length === 1 ? '' : 's'}`} loading={save.isPending} onPress={() => save.mutate()} />}>
      {query.isPending ? <LoadingState /> : <Calendar selected={selected} onToggle={toggle} />}
      <Notice>You won’t receive new assignments on off-days. Inform Ops for days with already accepted visits.</Notice>
    </Screen>
  );
}
