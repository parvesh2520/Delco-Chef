import React from 'react';
import { Linking } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, InfoRow, Notice, QueryView, Screen, StatusHero, Txt } from '../../../src/components';
import { customerService } from '../../../src/services';
import { formatDateTime } from '../../../src/utils';

/** Download my data + data export status. */
export default function DataExport() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['dataExport'], queryFn: customerService.getDataExport, refetchInterval: (q) => (q.state.data?.status === 'processing' ? 4000 : false) });
  const request = useMutation({
    mutationFn: customerService.requestDataExport,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dataExport'] }),
  });
  return (
    <Screen eyebrow="Privacy" title="Download my data" refreshing={query.isRefetching} onRefresh={query.refetch}>
      <Txt variant="body">Get a copy of your profile, addresses, bookings, trials, visits and payments as a downloadable file.</Txt>
      <QueryView query={query}>
        {(e) =>
          e.status === 'none' || e.status === 'expired' ? (
            <>
              {e.status === 'expired' && <Notice tone="warning">Your previous export link expired.</Notice>}
              <Button title="Request my data" icon="download-outline" loading={request.isPending} onPress={() => request.mutate()} />
            </>
          ) : (
            <>
              <Card>
                <Txt variant="h3">Export status</Txt>
                <Badge status={e.status === 'ready' ? 'completed' : 'pending'} label={e.status === 'ready' ? 'Ready' : 'Processing'} />
                <InfoRow label="Requested" value={e.requestedAt ? formatDateTime(e.requestedAt) : undefined} />
                <InfoRow label="Ready" value={e.readyAt ? formatDateTime(e.readyAt) : undefined} />
              </Card>
              {e.status === 'ready' && e.downloadUrl ? (
                <Button title="Download file" icon="cloud-download-outline" onPress={() => Linking.openURL(e.downloadUrl!)} />
              ) : (
                <StatusHero tone="warning" icon="hourglass-outline" title="Preparing your data" message="We’re preparing your file. We’ll notify you when it’s ready to download." />
              )}
            </>
          )
        }
      </QueryView>
      {request.isError && <Notice tone="error">{request.error.message}</Notice>}
    </Screen>
  );
}
