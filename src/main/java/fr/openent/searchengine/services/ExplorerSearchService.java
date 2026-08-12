/*
 * Copyright © "PASS Technologie", 2026.
 *
 * This file is part of OPEN ENT NG. OPEN ENT NG is a versatile ENT Project based on the JVM and ENT Core Project.
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation (version 3 of the License).
 */
package fr.openent.searchengine.services;

import io.vertx.core.Future;
import io.vertx.core.Vertx;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import org.entcore.common.elasticsearch.ElasticClientManager;
import org.entcore.common.elasticsearch.ElasticClient;
import org.entcore.common.user.UserInfos;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Source de résultats adossée aux index Explorer d'OpenSearch (`resource-*`).
 * <p>
 * Le moteur historique interroge chaque module via son {@code SearchingHandler}
 * (MongoDB/PostgreSQL). Les ressources gérées par l'Explorer — blog, wiki, carte
 * mentale, mur collaboratif, frise, cahier multimédia… — sont, elles, indexées
 * dans OpenSearch et n'étaient couvertes par aucune de ces sources.
 * <p>
 * <b>Droits.</b> Chaque document porte un tableau {@code rights} sérialisé par
 * {@code org.entcore.common.share.ShareModel} : {@code creator:USER_ID},
 * {@code user:USER_ID:ROLE}, {@code group:GROUP_ID:ROLE}. La requête n'accepte
 * donc un document que s'il est créé par l'utilisateur, partagé avec lui, ou
 * partagé avec l'un de ses groupes — et jamais s'il est à la corbeille. Sans ce
 * filtre, la recherche exposerait les ressources privées de tout le monde.
 */
public class ExplorerSearchService {

    private static final Logger log = LoggerFactory.getLogger(ExplorerSearchService.class);

    /** Nom du type exposé par GET /searchengine/types et accepté dans `filter`. */
    public static final String TYPE = "ExplorerSearchingEvents";

    /** Index Explorer : une entrée par application indexée. */
    private static final String INDEX = "resource-*";

    private final ElasticClientManager manager;
    private final int pagingSize;

    private ExplorerSearchService(final ElasticClientManager manager, final int pagingSize) {
        this.manager = manager;
        this.pagingSize = pagingSize;
    }

    /**
     * Construit le service si la plateforme expose une configuration Elasticsearch,
     * sinon renvoie un service désactivé : le moteur continue alors de fonctionner
     * avec ses seules sources historiques.
     */
    public static ExplorerSearchService create(final Vertx vertx, final JsonObject config, final int pagingSize) {
        try {
            return new ExplorerSearchService(ElasticClientManager.create(vertx, config), pagingSize);
        } catch (Exception e) {
            log.info("[SearchEngine] Explorer/OpenSearch source disabled: " + e.getMessage());
            return new ExplorerSearchService(null, pagingSize);
        }
    }

    public boolean isEnabled() {
        return manager != null;
    }

    /**
     * Recherche les ressources Explorer visibles par l'utilisateur.
     *
     * @param page page courante (0-based) — une entrée supplémentaire est demandée
     *             pour que l'appelant sache s'il reste des résultats.
     * @return les résultats au format attendu par le moteur (title, description,
     *         modified, ownerDisplayName, ownerId, url).
     */
    public Future<JsonArray> search(final UserInfos user, final JsonArray words, final int page) {
        if (!isEnabled()) return Future.succeededFuture(new JsonArray());

        final String terms = words.stream().map(String::valueOf).collect(Collectors.joining(" "));
        if (terms.trim().isEmpty()) return Future.succeededFuture(new JsonArray());

        final JsonObject payload = new JsonObject()
            .put("from", page * pagingSize)
            // +1 : marqueur « il reste des résultats », comme les sources historiques.
            .put("size", pagingSize + 1)
            .put("_source", new JsonArray()
                .add("name").add("description").add("application").add("assetId")
                .add("creatorId").add("creatorName").add("updatedAt"))
            .put("query", new JsonObject().put("bool", new JsonObject()
                .put("must", new JsonArray().add(new JsonObject().put("multi_match", new JsonObject()
                    .put("query", terms)
                    // `name` est mappé en keyword (recherche exacte) : la recherche
                    // plein texte doit viser `contentAll`, le champ analysé qui reçoit
                    // name et creatorName via copy_to, ainsi que `contentHtml`.
                    .put("fields", new JsonArray().add("contentAll^3").add("contentHtml"))
                    .put("operator", "and"))))
                .put("filter", new JsonArray().add(new JsonObject().put("term",
                    new JsonObject().put("trashed", false))))
                .put("should", visibilityClauses(user))
                .put("minimum_should_match", 1)));

        return manager.getClient()
            .search(INDEX, payload, new ElasticClient.ElasticOptions())
            .map(this::format)
            .otherwise(th -> {
                log.error("[SearchEngine] Explorer/OpenSearch search failed", th);
                return new JsonArray();
            });
    }

    /** Clauses de visibilité : créateur, partage nominatif, partage à un groupe. */
    private JsonArray visibilityClauses(final UserInfos user) {
        final JsonArray should = new JsonArray();
        should.add(new JsonObject().put("term",
            new JsonObject().put("rights", "creator:" + user.getUserId())));
        // `user:ID:ROLE` / `group:ID:ROLE` : le rôle importe peu, tout partage donne
        // au minimum la lecture.
        should.add(new JsonObject().put("prefix",
            new JsonObject().put("rights", "user:" + user.getUserId() + ":")));
        final List<String> groups = new ArrayList<>();
        if (user.getGroupsIds() != null) groups.addAll(user.getGroupsIds());
        for (final String groupId : groups) {
            should.add(new JsonObject().put("prefix",
                new JsonObject().put("rights", "group:" + groupId + ":")));
        }
        return should;
    }

    /** Met les documents au format de colonnes attendu par le moteur et son IHM. */
    private JsonArray format(final JsonArray hits) {
        final JsonArray results = new JsonArray();
        for (int i = 0; i < hits.size(); i++) {
            final JsonObject hit = hits.getJsonObject(i);
            if (hit == null) continue;
            final String application = hit.getString("application", "");
            final String assetId = hit.getString("assetId", "");
            results.add(new JsonObject()
                .put("title", hit.getString("name", ""))
                .put("description", hit.getString("description", ""))
                // Les sources historiques renvoient une date Mongo ; l'IHM lit `modified.$date`.
                .put("modified", new JsonObject().put("$date", hit.getLong("updatedAt", 0L)))
                .put("ownerDisplayName", hit.getString("creatorName", ""))
                .put("ownerId", hit.getString("creatorId", ""))
                .put("url", buildUrl(application, assetId)));
        }
        return results;
    }

    /**
     * Lien vers la ressource. Les applications Explorer partagent la route
     * {@code /<application>#/view/<assetId>} ; à défaut d'identifiant on renvoie
     * vers l'application, ce qui vaut mieux qu'un lien mort.
     */
    private String buildUrl(final String application, final String assetId) {
        if (application == null || application.isEmpty()) return "/";
        if (assetId == null || assetId.isEmpty()) return "/" + application;
        return "/" + application + "#/view/" + assetId;
    }
}
