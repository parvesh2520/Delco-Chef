import React from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Badge, Card, Screen, Txt } from '../../../src/components';
import { Row } from '../../../src/features/admin';
import { QueryView } from '../../../src/components';
import { adminService } from '../../../src/services';
import { colors } from '../../../src/theme';
import { formatDateTime } from '../../../src/utils';

export default function AssignmentHistory() {
  const { requestId } = useLocalSearchParams<{ requestId: string }>();
  const query = useQuery({ queryKey: ['admin', 'history', requestId], queryFn: () => adminService.getAssignmentHistory(requestId) });
  return (
    <Screen title="Assignment history" subtitle={`Request ${requestId}`}>
      <QueryView query={query} empty={{ title: 'No assignments yet', icon: 'git-branch-outline' }}>
        {(items) =>
          items.map((h, i) => (
            <Row key={h.id} gap={12}>
              <View style={{ alignItems: 'center', alignSelf: 'stretch' }}>
                <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: i === 0 ? colors.accent : colors.purple, marginTop: 18 }} />
                {i < items.length - 1 && <View style={{ flex: 1, width: 2, backgroundColor: colors.border }} />}
              </View>
              <Card style={{ flex: 1 }}>
                <Row>
                  <Txt variant="h3" style={{ flex: 1 }}>{h.chefName}</Txt>
                  <Badge status={h.action === 'declined_by_chef' ? 'declined' : 'assigned'} label={h.action.replace(/_/g, ' ')} />
                </Row>
                {h.reason && <Txt variant="body">Reason: {h.reason}</Txt>}
                <Txt variant="caption">{h.by} · {formatDateTime(h.at)}</Txt>
              </Card>
            </Row>
          ))
        }
      </QueryView>
    </Screen>
  );
}
