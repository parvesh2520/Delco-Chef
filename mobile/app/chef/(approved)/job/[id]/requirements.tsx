import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Card, InfoRow, QueryView, Screen, Section, Txt } from '../../../../../src/components';
import { DIET_LABELS } from '../../../../../src/constants';
import { AllergyNotice, mealsText, useVisit } from '../../../../../src/features/chef';

/** Customer requirements and allergy information for a job. */
export default function ChefJobRequirements() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useVisit(id);
  return (
    <Screen title="Customer requirements">
      <QueryView query={query} empty={{ title: 'Job not found' }}>
        {(v) => v && (
          <>
            <Section title="Allergies" eyebrow="Read first">
              <AllergyNotice allergies={v.allergies} />
            </Section>
            <Card>
              <InfoRow icon="leaf-outline" label="Diet" value={DIET_LABELS[v.diet]} />
              <InfoRow icon="restaurant-outline" label="Cuisines" value={v.cuisines.join(', ')} />
              <InfoRow icon="fast-food-outline" label="Meals" value={mealsText(v.meals)} />
              <InfoRow icon="people-outline" label="Members" value={v.members} />
            </Card>
            <Section title="Special instructions">
              <Card tone="cream">
                <Txt variant="body">{v.instructions || 'No special instructions.'}</Txt>
              </Card>
            </Section>
          </>
        )}
      </QueryView>
    </Screen>
  );
}
