import React, { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Badge, Button, Card, ConfirmDialog, Notice, Screen, Txt } from '../../../../../src/components';
import { Row, useAdminInvalidate } from '../../../../../src/features/admin';
import { QueryView } from '../../../../../src/components';
import { adminService } from '../../../../../src/services';
import type { Chef, ChefDocument } from '../../../../../src/types';
import { formatDate, humanize } from '../../../../../src/utils';

/** Super Admin: document review with audit-logged reveal of sensitive values. */
export default function ChefDocuments() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [target, setTarget] = useState<ChefDocument | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const invalidate = useAdminInvalidate();
  const query = useQuery({ queryKey: ['admin', 'chefs'], queryFn: adminService.listChefApplications, select: (cs: Chef[]) => cs.find((c) => c.id === id) ?? null });
  const reveal = useMutation({
    mutationFn: (doc: ChefDocument) => adminService.revealDocument(id, doc.id, 'Chef application verification'),
    onSuccess: (res, doc) => {
      setRevealed((r) => ({ ...r, [doc.id]: res.value ?? 'Image only — open the file' }));
      setTarget(null);
      invalidate();
    },
  });
  return (
    <Screen eyebrow="Super Admin" title="Document review" subtitle={query.data?.name}>
      <Notice tone="warning" icon="shield-outline">Documents are masked by default. Revealing a value is recorded in the audit log.</Notice>
      <QueryView query={query} isEmpty={(c) => !c || c.documents.length === 0} empty={{ title: 'No documents uploaded' }}>
        {(c) =>
          c.documents.map((d) => (
            <Card key={d.id}>
              <Row>
                <Txt variant="h3" style={{ flex: 1 }}>{humanize(d.type)}</Txt>
                <Badge status={d.status} />
              </Row>
              <Txt variant="bodyStrong">{revealed[d.id] ?? d.maskedValue}</Txt>
              <Txt variant="caption">{d.fileName} · uploaded {formatDate(d.uploadedAt)}</Txt>
              {!revealed[d.id] && d.type !== 'photo' && (
                <Button title="Reveal" icon="eye-outline" variant="secondary" small onPress={() => setTarget(d)} style={{ alignSelf: 'flex-start' }} />
              )}
            </Card>
          ))
        }
      </QueryView>
      <Notice>File preview and verify/reject per document need the document storage API (pending).</Notice>
      <ConfirmDialog
        visible={!!target}
        title="Reveal sensitive document?"
        message={`You are about to view the full ${target ? humanize(target.type) : ''} number. This action is audit-logged with your name and time.`}
        confirmLabel="Reveal"
        loading={reveal.isPending}
        onCancel={() => setTarget(null)}
        onConfirm={() => target && reveal.mutate(target)}
      />
    </Screen>
  );
}
