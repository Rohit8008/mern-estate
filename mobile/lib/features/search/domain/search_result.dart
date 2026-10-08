/// One result inside a group (a property, lead, owner, buyer requirement…).
class SearchItem {
  const SearchItem({required this.id, required this.title, required this.subtitle});
  final String id;
  final String title;
  final String subtitle;

  factory SearchItem.fromJson(Map<String, dynamic> j) => SearchItem(
        id: (j['_id'] ?? j['id'] ?? '').toString(),
        title: (j['title'] ?? '').toString(),
        subtitle: (j['subtitle'] ?? '').toString(),
      );
}

/// A group of results for one entity type, as returned by /api/search.
class SearchGroup {
  const SearchGroup({required this.entity, required this.label, required this.items});
  final String entity; // listings | clients | owners | buyers | ...
  final String label;
  final List<SearchItem> items;

  factory SearchGroup.fromJson(Map<String, dynamic> j) => SearchGroup(
        entity: (j['entity'] ?? '').toString(),
        label: (j['label'] ?? '').toString(),
        items: ((j['items'] as List?) ?? const [])
            .map((e) => SearchItem.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}
