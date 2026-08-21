import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../theme/theme.dart';
import 'playground_card.dart';

class PlaygroundCardWidget extends StatelessWidget {
  const PlaygroundCardWidget({super.key, required this.card});

  final PlaygroundCard card;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(top: Grid.half),
      padding: const EdgeInsets.all(Grid.twelve),
      decoration: BoxDecoration(
        color: context.colors.surfaceContainerHighest.withValues(alpha: 0.6),
        borderRadius: BorderRadius.circular(Radii.md),
        border: Border.all(
          color: context.colors.outline.withValues(alpha: 0.7),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(card.name, style: context.textTheme.titleSmall),
          const SizedBox(height: Grid.half),
          Text(card.url, style: context.textTheme.bodySmall),
          const SizedBox(height: Grid.half),
          Text(
            'PIN ${card.pin}${card.stack != null ? ' · ${card.stack}' : ''}',
            style: context.textTheme.labelSmall,
          ),
          const SizedBox(height: Grid.twelve),
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton(
              onPressed: () async {
                final uri = Uri.tryParse(card.url);
                if (uri == null) return;
                await launchUrl(uri, mode: LaunchMode.externalApplication);
              },
              child: const Text('Open in browser'),
            ),
          ),
        ],
      ),
    );
  }
}
