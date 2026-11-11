import React from 'react';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { ListGroup, ListRow, Screen } from '../../../src/components';
import { QueryView } from '../../../src/components';
import { adminService } from '../../../src/services';

/** Platform settings sections. */
export default function Settings() {
  const query = useQuery({ queryKey: ['admin', 'settings'], queryFn: adminService.getSettings });
  return (
    <Screen eyebrow="Configuration" title="Settings">
      <QueryView query={query}>
        {(sections) => (
          <ListGroup>
            {sections.map((s) => (
              <ListRow
                key={s.key}
                icon={s.icon as keyof typeof Ionicons.glyphMap}
                title={s.title}
                subtitle={s.description}
                onPress={() => router.push(`/admin/settings/${s.key}`)}
              />
            ))}
          </ListGroup>
        )}
      </QueryView>
    </Screen>
  );
}
