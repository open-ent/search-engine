/*
 * Copyright © Conseil Régional Nord Pas de Calais - Picardie, 2016.
 *
 * This file is part of OPEN ENT NG. OPEN ENT NG is a versatile ENT Project based on the JVM and ENT Core Project.
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation (version 3 of the License).
 *
 * For the sake of explanation, any module that communicate over native
 * Web protocols, such as HTTP, with OPEN ENT NG is outside the scope of this
 * license and could be license under its own terms. This is merely considered
 * normal use of OPEN ENT NG, and does not fall under the heading of "covered work".
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 */

package fr.openent.searchengine;

import fr.openent.searchengine.controllers.SearchEngineController;
import io.vertx.core.Promise;
import org.entcore.common.http.BaseServer;

public class SearchEngine extends BaseServer {

	@Override
	public void start(Promise<Void> startPromise) throws Exception {
    final Promise<Void> promise = Promise.promise();
		super.start(promise);
    promise.future().map(e ->
      addController(new SearchEngineController(config.getInteger("max-sec-time-allowed", 4),
        config.getInteger("paging-size-per-collection", 10), config.getInteger("search-word-min-size", 4),
        config.getString("frontend-ui", "react")))
    )
    .onSuccess(e -> startPromise.complete())
    .onFailure(startPromise::fail);
	}

}
