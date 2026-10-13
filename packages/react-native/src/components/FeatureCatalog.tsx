import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSurfaceColors } from './layout';

export interface CatalogSection {
  id: string;
  title: string;
  items: { id: string; title: string; description?: string; accessibilityLabel?: string }[];
}
/** Routing, access filtering and copy remain application inputs. */
export function FeatureCatalog({
  eyebrow,
  title,
  description,
  sections,
  onSelect,
}: {
  eyebrow: string;
  title: string;
  description: string;
  sections: CatalogSection[];
  onSelect: (id: string) => void;
}) {
  const c = useSurfaceColors();
  return (
    <>
      <View style={{ gap: 12, paddingVertical: 12 }}>
        <Text style={{ color: c.blue, fontSize: 13, fontWeight: '700' }}>{eyebrow}</Text>
        <Text accessibilityRole="header" style={{ color: c.text, fontSize: 32, lineHeight: 38, fontWeight: '800' }}>
          {title}
        </Text>
        <Text style={{ color: c.muted, fontSize: 15, lineHeight: 23 }}>{description}</Text>
      </View>
      {sections.map((section) => (
        <View key={section.id} style={{ gap: 12, marginBottom: 12 }}>
          <Text style={{ color: c.muted, fontSize: 12, fontWeight: '700', letterSpacing: 1 }}>
            {section.title.toUpperCase()}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {section.items.map((item) => (
              <Pressable
                key={item.id}
                accessibilityRole="link"
                accessibilityLabel={item.accessibilityLabel ?? item.title}
                onPress={() => onSelect(item.id)}
                style={({ pressed }) => ({
                  width: '48%',
                  flexGrow: 1,
                  minHeight: 145,
                  borderWidth: 1,
                  borderColor: c.border,
                  borderRadius: 16,
                  padding: 18,
                  gap: 10,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text style={{ color: c.text, fontWeight: '700', fontSize: 17 }}>{item.title}</Text>
                {!!item.description && <Text style={{ color: c.muted, fontSize: 13, lineHeight: 20 }}>{item.description}</Text>}
              </Pressable>
            ))}
          </View>
        </View>
      ))}
    </>
  );
}
