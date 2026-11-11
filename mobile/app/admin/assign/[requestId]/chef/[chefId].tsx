import React from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Avatar, Button, Card, InfoRow, Screen, Section, Txt } from '../../../../../src/components';
import { Row } from '../../../../../src/features/admin';
import { QueryView } from '../../../../../src/components';
import { adminService } from '../../../../../src/services';
import { colors, radius } from '../../../../../src/theme';

const Bar = ({ label, value }: { label: string; value: number }) => (
  <View style={{ gap: 4 }}>
    <Row>
      <Txt variant="small" style={{ flex: 1 }}>{label}</Txt>
      <Txt variant="label">{value}</Txt>
    </Row>
    <View style={{ height: 6, borderRadius: radius.pill, backgroundColor: colors.border }}>
      <View style={{ height: 6, borderRadius: radius.pill, width: `${value}%`, backgroundColor: colors.purple }} />
    </View>
  </View>
);

/** Chef details relevant to assigning this request. */
export default function AssignChefDetails() {
  const { requestId, chefId, reason, push, date } = useLocalSearchParams<{ requestId: string; chefId: string; reason?: string; push?: string; date?: string }>();
  const query = useQuery({ queryKey: ['admin', 'suggestions', requestId, push ? date : ''], queryFn: () => adminService.getSuggestions(requestId, push ? date : undefined) });
  return (
    <Screen
      title="Chef details"
      footer={
        query.data?.find((s) => s.chefId === chefId)?.eligible ? (
          <Button title="Select this chef" onPress={() => router.push({ pathname: '/admin/assign/[requestId]/confirm', params: { requestId, chefId, ...(reason ? { reason } : {}), ...(push ? { push, date } : {}) } })} />
        ) : undefined
      }
    >
      <QueryView query={query} isEmpty={(list) => !list.some((s) => s.chefId === chefId)} empty={{ title: 'Chef not found' }}>
        {(list) => {
          const s = list.find((x) => x.chefId === chefId)!;
          return (
            <>
              <Card tone="cream">
                <Row gap={12}>
                  <Avatar name={s.chefName} size={52} />
                  <View style={{ flex: 1 }}>
                    <Txt variant="h2">{s.chefName}</Txt>
                    <Txt variant="small">{s.eligible ? `Match score ${s.score}/100` : 'Not eligible'}</Txt>
                  </View>
                </Row>
              </Card>
              <Card>
                <InfoRow label="Distance" value={`${s.distanceKm} km from customer`} icon="navigate-outline" />
                <InfoRow label="Rating" value={s.rating ? `${s.rating.toFixed(1)} / 5` : 'New chef'} icon="star-outline" />
                <InfoRow label="Experience" value={`${s.experienceYears} years`} icon="ribbon-outline" />
                <InfoRow label="Active jobs" value={s.activeJobs} icon="briefcase-outline" />
                <InfoRow label="Cuisines" value={s.cuisines.join(', ')} icon="restaurant-outline" />
              </Card>
              <Section title="Score breakdown">
                <Card>
                  <Bar label="Distance" value={s.breakdown.distance} />
                  <Bar label="Rating" value={s.breakdown.rating} />
                  <Bar label="Workload" value={s.breakdown.workload} />
                  <Bar label="Cuisine match" value={s.breakdown.cuisine} />
                </Card>
              </Section>
            </>
          );
        }}
      </QueryView>
    </Screen>
  );
}
