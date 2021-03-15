USER_ID=$(shell id -u)
GROUP_ID=$(shell id -g)
PROJECT_PATH=$(shell pwd)

include .env

#------------------------------------------------------------------------------

ifeq (,$(FOUNDRY_DATA_PATH))
	echo 'FOUNDRY_DATA_PATH environment variable is not defined'
	exit;
endif

ifeq (,$(PROJECT_NAME))
	echo 'PROJECT_NAME environment variable is not defined'
	exit;
endif

npm = docker run -ti --rm \
		-v ${PROJECT_PATH}:/var/foundry/${PROJECT_NAME} \
		-v ${FOUNDRY_DATA_PATH}:/var/foundry/data \
		-v ${HOME}/.npm:/.npm \
		-v ${HOME}/.config:/.config \
		-v ${HOME}/.gitconfig:/etc/gitconfig \
		-w /var/foundry/${PROJECT_NAME} \
		-u ${USER_ID}:${GROUP_ID} \
		--entrypoint="" \
		node:12 \
		npm ${1}

# Spread cli arguments
ifneq (,$(filter npm-install npm-uninstall npm-update, $(firstword $(MAKECMDGOALS))))
    NPM_CLI_ARGS := $(wordlist 2,$(words $(MAKECMDGOALS)),$(MAKECMDGOALS))
    $(eval $(NPM_CLI_ARGS):;@:)
endif

# Spread cli arguments
ifneq (,$(filter publish, $(firstword $(MAKECMDGOALS))))
    GULP_CLI_ARGS := $(wordlist 2,$(words $(MAKECMDGOALS)),$(MAKECMDGOALS))
    $(eval $(GULP_CLI_ARGS):;@:)
endif

#------------------------------------------------------------------------------
# NPM
#------------------------------------------------------------------------------
npm-install: npm-cache-dir
	$(call npm, install $(NPM_CLI_ARGS))

npm-update: npm-cache-dir
	$(call npm, update $(NPM_CLI_ARGS))

npm-uninstall: npm-cache-dir
	$(call npm, uninstall --silent $(NPM_CLI_ARGS))

npm-clean:
	-rm -rf node_modules

npm-clean-cache: npm-cache-dir
	$(call npm, cache clean --force)

npm-cache-dir:
	mkdir -p ~/.npm

#------------------------------------------------------------------------------
# Init
#------------------------------------------------------------------------------
init: npm-install

#------------------------------------------------------------------------------
# Build and packaging
#------------------------------------------------------------------------------
package:
	$(call npm, run package)

build:
	$(call npm, run build)

watch:
	$(call npm, run build:watch)

clean:
	$(call npm, run clean)

publish:
	$(call npm, run publish -- --release=$(GULP_CLI_ARGS))

#------------------------------------------------------------------------------

.PHONY: npm-install npm-update npm-cache-dir npm-clean-cache init build